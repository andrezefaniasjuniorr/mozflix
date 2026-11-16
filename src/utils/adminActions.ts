import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { PinTargetType } from '../types/mozflix';
import { normalizeMozPhone } from './device';
import { getMillis } from './formatters';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateHighEntropySuffix(length = 8): string {
  const bytes = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export async function logAdminAction(
  adminUid: string,
  adminEmail: string,
  action: string,
  details: string
): Promise<void> {
  try {
    await addDoc(collection(db, 'adminLogs'), {
      adminUid,
      adminEmail,
      action,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Erro ao registar log de admin:', err);
  }
}

function isCallableUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('not-found') ||
    msg.includes('internal') ||
    msg.includes('network') ||
    msg.includes('cors') ||
    msg.includes('unavailable') ||
    msg.includes('failed to fetch')
  );
}

export async function adminGeneratePins(params: {
  targetType: PinTargetType;
  packageId?: string | null;
  packageName: string;
  includeAllContent: boolean;
  videoIds: string[];
  videoTitles?: string[];
  duracaoHoras: number;
  precoMt: number;
  quantidade: number;
  prefixo: string;
  adminUid: string;
  adminEmail: string;
}): Promise<{ count: number; codes: string[] }> {
  const cleanLabel = params.packageName.trim();
  const hours = Math.max(1, Number(params.duracaoHoras || 24));
  const price = Math.max(0, Number(params.precoMt ?? 0));
  const qty = Math.min(Math.max(Number(params.quantidade || 1), 1), 200);
  const cleanPrefix =
    params.prefixo
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 10) || 'MOZ-';

  try {
    const fn = httpsCallable<
      {
        targetType: PinTargetType;
        packageId?: string | null;
        packageName: string;
        tipoPacote: string;
        includeAllContent: boolean;
        videoIds: string[];
        videoTitles?: string[];
        duracaoHoras: number;
        precoMt: number;
        quantidade: number;
        prefixo: string;
      },
      { success: boolean; count: number; codes: string[] }
    >(functions, 'generatePins');
    const res = await fn({
      targetType: params.targetType,
      packageId: params.packageId || null,
      packageName: cleanLabel,
      tipoPacote: cleanLabel,
      includeAllContent: params.includeAllContent,
      videoIds: params.videoIds,
      videoTitles: params.videoTitles || [],
      duracaoHoras: hours,
      precoMt: price,
      quantidade: qty,
      prefixo: cleanPrefix,
    });
    return { count: res.data.count, codes: res.data.codes };
  } catch (err) {
    if (!isCallableUnavailable(err)) {
      throw err;
    }

    // Fallback seguro autenticado como Admin quando Cloud Functions ainda não foram publicadas
    const expiraEm = Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const codes: string[] = [];
    const unique = new Set<string>();
    const batch = writeBatch(db);

    while (codes.length < qty) {
      const codigo = `${cleanPrefix}${generateHighEntropySuffix(8)}`;
      if (unique.has(codigo)) continue;
      unique.add(codigo);
      batch.set(doc(db, 'pins', codigo), {
        codigo,
        targetType: params.targetType,
        packageId: params.packageId || null,
        packageName: cleanLabel,
        tipoPacote: cleanLabel,
        includeAllContent: params.includeAllContent,
        videoIds: params.videoIds,
        videoTitles: params.videoTitles || [],
        duracaoHoras: hours,
        precoMt: price,
        usado: false,
        usadoPor: null,
        usadoPorTelefone: null,
        usedDeviceId: null,
        usadoEm: null,
        desativado: false,
        criadoEm: serverTimestamp(),
        expiraEm,
      });
      codes.push(codigo);
    }

    await batch.commit();
    await logAdminAction(
      params.adminUid,
      params.adminEmail,
      'GERAR_PINS',
      `Gerados ${qty} código(s) para "${cleanLabel}" (${hours}h · ${price} MT)`
    );

    return { count: codes.length, codes };
  }
}

export async function redeemPinCode(params: {
  codigo: string;
  uid: string;
  userContact: string;
  deviceId: string;
  serverNowMs: number;
}): Promise<{ message: string; label: string }> {
  const cleaned = params.codigo.trim().toUpperCase();
  if (!cleaned || cleaned.length < 4) {
    throw new Error('Código PIN inválido.');
  }

  // 1. Tentar Cloud Function oficial primeiro
  try {
    const fn = httpsCallable<
      { codigo: string; deviceId: string },
      { success: boolean; message: string; label?: string }
    >(functions, 'redeemPin');
    const res = await fn({ codigo: cleaned, deviceId: params.deviceId });
    return {
      message: res.data?.message || 'Código ativado com sucesso!',
      label: res.data?.label || '',
    };
  } catch (err) {
    if (!isCallableUnavailable(err)) {
      const msg =
        err instanceof Error
          ? err.message.replace(/^FirebaseError:\s*/i, '')
          : 'Código inválido ou expirado.';
      throw new Error(msg);
    }
  }

  // 2. Fallback por transação atómica validada por firestore.rules (sem necessidade de Blaze/Functions)
  const userRef = doc(db, 'users', params.uid);
  let nowMs = params.serverNowMs || Date.now();
  try {
    await setDoc(userRef, { lastLoginAt: serverTimestamp() }, { merge: true });
    const srvSnap = await getDoc(userRef);
    const srvMs = getMillis(srvSnap.data()?.lastLoginAt);
    if (srvMs > 0) nowMs = srvMs;
  } catch {
    // Continua com serverNowMs calibrado
  }

  const attemptRef = doc(db, 'pinAttempts', params.uid);

  let prevAttempts = { count: 0, windowStartMs: nowMs, blockedUntilMs: 0 };
  try {
    const attemptSnap = await getDoc(attemptRef);
    if (attemptSnap.exists()) {
      const d = attemptSnap.data();
      prevAttempts = {
        count: Number(d.count || 0),
        windowStartMs: Number(d.windowStartMs || nowMs),
        blockedUntilMs: Number(d.blockedUntilMs || 0),
      };
      if (prevAttempts.blockedUntilMs > nowMs) {
        const minsLeft = Math.ceil((prevAttempts.blockedUntilMs - nowMs) / 60000);
        throw new Error(`Demasiadas tentativas falhadas. Tenta em ${minsLeft} min.`);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Demasiadas')) {
      throw e;
    }
  }

  const pinRef = doc(db, 'pins', cleaned);

  try {
    const result = await runTransaction(db, async (tx) => {
      const [pinSnap, userSnap] = await Promise.all([tx.get(pinRef), tx.get(userRef)]);

      if (!userSnap.exists()) {
        throw new Error('Conta não encontrada.');
      }
      const userData = userSnap.data();
      if (userData.isBlocked === true) {
        throw new Error('Conta bloqueada. Contacta o suporte.');
      }
      if (userData.deviceId && userData.deviceId !== params.deviceId) {
        throw new Error('Esta conta já está em uso noutro dispositivo.');
      }

      if (!pinSnap.exists()) {
        throw new Error('Código PIN inválido.');
      }

      const pinData = pinSnap.data();
      if (pinData.desativado === true) {
        throw new Error('Este código PIN foi desativado.');
      }
      if (pinData.usado === true) {
        throw new Error('Este código PIN já foi usado.');
      }

      const expMs = getMillis(pinData.expiraEm);
      if (expMs > 0 && expMs <= nowMs) {
        throw new Error('Este código PIN expirou.');
      }

      const hours = Number(pinData.duracaoHoras || 24);
      const addedMs = hours * 60 * 60 * 1000;
      const newExpiresAt = Timestamp.fromMillis(nowMs + addedMs);
      const targetType: PinTargetType =
        pinData.targetType || (pinData.packageId ? 'package' : 'content');
      const label = String(pinData.packageName || pinData.tipoPacote || 'Acesso');
      const videoIds: string[] = Array.isArray(pinData.videoIds) ? pinData.videoIds : [];
      const includeAllContent = Boolean(pinData.includeAllContent);

      // Ler docs de unlockedVideos antes das escritas (regra de transações Firestore)
      const limitedIds = videoIds.slice(0, 25);
      const existingUvSnaps = await Promise.all(
        limitedIds.map((vid) => tx.get(doc(db, 'users', params.uid, 'unlockedVideos', vid)))
      );

      // 1. Marcar PIN como usado neste dispositivo e conta
      tx.update(pinRef, {
        usado: true,
        usadoPor: params.uid,
        usadoPorTelefone: userData.phone || userData.email || params.userContact,
        usedDeviceId: params.deviceId,
        usadoEm: serverTimestamp(),
      });

      // 2. Criar registo independente do acesso (permite múltiplos filmes/pacotes sem conflito)
      tx.set(doc(db, 'users', params.uid, 'entitlements', cleaned), {
        pinCode: cleaned,
        userId: params.uid,
        targetType,
        packageId: pinData.packageId || null,
        packageName: label,
        includeAllContent,
        videoIds,
        duracaoHoras: hours,
        precoMt: Number(pinData.precoMt || 0),
        activatedAt: serverTimestamp(),
        expiresAt: newExpiresAt,
        deviceId: params.deviceId,
      });

      // 3. Desbloquear cada conteúdo associado em unlockedVideos
      limitedIds.forEach((vid, idx) => {
        const uvSnap = existingUvSnaps[idx];
        const prevMs = uvSnap.exists() ? getMillis(uvSnap.data()?.expiresAt) : 0;
        const vidExpMs = Math.max(prevMs, nowMs) + addedMs;
        tx.set(doc(db, 'users', params.uid, 'unlockedVideos', vid), {
          videoId: vid,
          pinCode: cleaned,
          expiresAt: Timestamp.fromMillis(vidExpMs),
          deviceId: params.deviceId,
          updatedAt: serverTimestamp(),
        });
      });

      // 4. Se for pacote, atualizar resumo do pacote ativo no documento do utilizador
      if (targetType === 'package') {
        const curPkgExp = getMillis(userData.packageExpiresAt);
        const stackedBase = curPkgExp > nowMs ? curPkgExp : nowMs;
        const stackedPkgExp = Timestamp.fromMillis(stackedBase + addedMs);
        const keepLongerPkgExp =
          curPkgExp > nowMs + addedMs ? userData.packageExpiresAt : newExpiresAt;

        tx.update(userRef, {
          currentPackage: label,
          packageExpiresAt: includeAllContent ? stackedPkgExp : keepLongerPkgExp,
          activePackageId: pinData.packageId || null,
          activePackageExpiresAt: newExpiresAt,
          includeAllContent:
            Boolean(userData.includeAllContent && curPkgExp > nowMs) || includeAllContent,
          lastRedeemedPin: cleaned,
          lastPackagePriceMt: Number(pinData.precoMt || 0),
          lastLoginAt: serverTimestamp(),
        });
      }

      return { label, hours };
    });

    return {
      message: `${result.label} ativado por ${result.hours}h!`,
      label: result.label,
    };
  } catch (err) {
    // Registar tentativa falhada para bloqueio anti-força bruta
    try {
      const withinWindow = nowMs - prevAttempts.windowStartMs < 15 * 60 * 1000;
      const nextCount = withinWindow ? prevAttempts.count + 1 : 1;
      const blockedUntilMs = nextCount >= 5 ? nowMs + 15 * 60 * 1000 : prevAttempts.blockedUntilMs;

      await setDoc(attemptRef, {
        count: nextCount,
        windowStartMs: withinWindow ? prevAttempts.windowStartMs : nowMs,
        blockedUntilMs,
        updatedAt: serverTimestamp(),
      });

      if (nextCount >= 5) {
        await addDoc(collection(db, 'securityAlerts'), {
          type: 'PIN_BRUTE_FORCE',
          userId: params.uid,
          userContact: params.userContact,
          deviceId: params.deviceId,
          details: `Bloqueio de 15 min após ${nextCount} códigos inválidos (${cleaned}).`,
          createdAt: serverTimestamp(),
        });
      }
    } catch {
      // Não mascarar erro principal do PIN
    }

    throw err;
  }
}

export async function adminBlockUser(params: {
  targetUid: string;
  targetLabel: string;
  blocked: boolean;
  adminUid: string;
  adminEmail: string;
}): Promise<void> {
  try {
    const fn = httpsCallable<{ targetUid: string; blocked: boolean }, { success: boolean }>(
      functions,
      'blockUser'
    );
    await fn({ targetUid: params.targetUid, blocked: params.blocked });
  } catch (err) {
    if (!isCallableUnavailable(err)) {
      throw err;
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'users', params.targetUid), {
      isBlocked: params.blocked,
    });
    if (params.blocked) {
      batch.delete(doc(db, 'watchSessions', params.targetUid));
    }
    await batch.commit();
    await logAdminAction(
      params.adminUid,
      params.adminEmail,
      params.blocked ? 'BLOQUEAR_USUARIO' : 'DESBLOQUEAR_USUARIO',
      `${params.blocked ? 'Bloqueou' : 'Desbloqueou'} o utilizador ${params.targetLabel}`
    );
  }
}

export async function adminActivatePackageManually(params: {
  phone: string;
  targetUid?: string;
  tipoPacote: string;
  packageId?: string | null;
  includeAllContent?: boolean;
  videoIds?: string[];
  duracaoHoras: number;
  valorMt: number;
  transacaoId: string;
  adminUid: string;
  adminEmail: string;
}): Promise<{ telefone: string; valorMt: number }> {
  const hours = Math.max(1, Number(params.duracaoHoras || 24));
  const price = Math.max(0, Number(params.valorMt || 0));

  try {
    const fn = httpsCallable<
      {
        phone: string;
        targetUid?: string;
        tipoPacote: string;
        packageId?: string | null;
        includeAllContent?: boolean;
        videoIds?: string[];
        duracaoHoras: number;
        valorMt: number;
        transacaoId: string;
      },
      { success: boolean; telefone: string; valorMt: number }
    >(functions, 'activatePackageManually');
    const res = await fn({
      phone: params.phone,
      targetUid: params.targetUid,
      tipoPacote: params.tipoPacote,
      packageId: params.packageId || null,
      includeAllContent: Boolean(params.includeAllContent),
      videoIds: params.videoIds || [],
      duracaoHoras: hours,
      valorMt: price,
      transacaoId: params.transacaoId,
    });
    return { telefone: res.data.telefone, valorMt: res.data.valorMt };
  } catch (err) {
    if (!isCallableUnavailable(err)) {
      throw err;
    }

    let userSnap = params.targetUid
      ? await getDoc(doc(db, 'users', params.targetUid))
      : null;

    if (!userSnap || !userSnap.exists()) {
      const normalized = normalizeMozPhone(params.phone);
      const q = query(
        collection(db, 'users'),
        where('phone', '==', normalized),
        limit(1)
      );
      const qs = await getDocs(q);
      if (qs.empty) {
        const rawQ = query(
          collection(db, 'users'),
          where('phone', '==', params.phone.trim()),
          limit(1)
        );
        const rawQs = await getDocs(rawQ);
        if (rawQs.empty) {
          throw new Error('Nenhum utilizador encontrado com este telefone.');
        }
        userSnap = rawQs.docs[0];
      } else {
        userSnap = qs.docs[0];
      }
    }

    const userData = userSnap.data()!;
    const uid = userSnap.id;
    const nowMs = Date.now();
    const curExp = getMillis(userData.packageExpiresAt);
    const baseMs = curExp > nowMs ? curExp : nowMs;
    const newExpiresAt = Timestamp.fromMillis(baseMs + hours * 60 * 60 * 1000);

    const batch = writeBatch(db);
    if (params.packageId || params.includeAllContent) {
      batch.update(doc(db, 'users', uid), {
        currentPackage: params.tipoPacote,
        packageExpiresAt: newExpiresAt,
        activePackageId: params.packageId || null,
        activePackageExpiresAt: newExpiresAt,
        includeAllContent: Boolean(params.includeAllContent),
        isBlocked: false,
        lastPackagePriceMt: price,
      });
    }

    const entId = `MANUAL-${Date.now()}`;
    batch.set(doc(db, 'users', uid, 'entitlements', entId), {
      pinCode: entId,
      userId: uid,
      targetType: params.packageId || params.includeAllContent ? 'package' : 'content',
      packageId: params.packageId || null,
      packageName: params.tipoPacote,
      includeAllContent: Boolean(params.includeAllContent),
      videoIds: params.videoIds || [],
      duracaoHoras: hours,
      precoMt: price,
      activatedAt: serverTimestamp(),
      expiresAt: newExpiresAt,
    });

    if (params.videoIds && params.videoIds.length > 0) {
      for (const vid of params.videoIds.slice(0, 40)) {
        batch.set(doc(db, 'users', uid, 'unlockedVideos', vid), {
          videoId: vid,
          pinCode: entId,
          expiresAt: newExpiresAt,
          updatedAt: serverTimestamp(),
        });
      }
    }

    const paymentRef = doc(collection(db, 'manualPayments'));
    batch.set(paymentRef, {
      userId: uid,
      telefone: userData.phone || params.phone,
      pacote: params.tipoPacote,
      valorMt: price,
      transacaoId: params.transacaoId.trim(),
      ativadoPorUid: params.adminUid,
      ativadoPorEmail: params.adminEmail,
      createdAt: serverTimestamp(),
    });

    const notifRef = doc(collection(db, 'users', uid, 'notifications'));
    batch.set(notifRef, {
      title: 'Acesso Ativado!',
      message: `${params.tipoPacote} (${price} MT) ativado por ${hours}h (Ref: ${params.transacaoId.trim()}).`,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    await logAdminAction(
      params.adminUid,
      params.adminEmail,
      'ATIVACAO_MANUAL',
      `Ativou ${params.tipoPacote} (${price} MT · ${hours}h) para ${userData.phone || uid}`
    );

    return { telefone: userData.phone || params.phone, valorMt: price };
  }
}
