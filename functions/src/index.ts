import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';

admin.initializeApp();
const db = admin.firestore();

type PinTargetType = 'content' | 'package';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateSecurePinSuffix(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

async function requireAdmin(request: CallableRequest<unknown>): Promise<{ uid: string; email: string }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  }
  const uid = request.auth.uid;
  const tokenEmail = (request.auth.token.email || '').toLowerCase();
  const isRootAdmin = tokenEmail === 'mozflix@gmail.com';
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists && !isRootAdmin) {
    throw new HttpsError('permission-denied', 'Perfil de administrador não encontrado.');
  }
  const userData = userSnap.data();
  if (!isRootAdmin && (!userData?.isAdmin || userData?.isBlocked === true)) {
    throw new HttpsError('permission-denied', 'Acesso restrito a administradores.');
  }
  return { uid, email: userData?.email || request.auth.token.email || 'mozflix@gmail.com' };
}

async function writeAdminLog(adminUid: string, adminEmail: string, action: string, details: string) {
  await db.collection('adminLogs').add({
    adminUid,
    adminEmail,
    action,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export const generatePins = onCall(async (request) => {
  const adminInfo = await requireAdmin(request);
  const {
    targetType = 'package',
    packageId = null,
    packageName,
    tipoPacote,
    includeAllContent = false,
    videoIds = [],
    videoTitles = [],
    duracaoHoras = 24,
    precoMt = 5,
    quantidade = 1,
    prefixo = 'MOZ-',
  } = (request.data || {}) as {
    targetType?: PinTargetType;
    packageId?: string | null;
    packageName?: string;
    tipoPacote?: string;
    includeAllContent?: boolean;
    videoIds?: string[];
    videoTitles?: string[];
    duracaoHoras?: number;
    precoMt?: number;
    quantidade?: number;
    prefixo?: string;
  };

  const label = String(packageName || tipoPacote || '').trim();
  if (!label) {
    throw new HttpsError('invalid-argument', 'Nome do pacote ou conteúdo obrigatório.');
  }

  const hours = Math.max(1, Number(duracaoHoras || 24));
  const price = Math.max(0, Number(precoMt ?? 0));
  const qty = Math.min(Math.max(Number(quantidade || 1), 1), 200);
  const cleanPrefix =
    (prefixo || 'MOZ-')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 10) || 'MOZ-';

  const now = admin.firestore.Timestamp.now();
  const expiraEm = admin.firestore.Timestamp.fromMillis(now.toMillis() + 90 * 24 * 60 * 60 * 1000);

  const generatedCodes: string[] = [];
  const usedSet = new Set<string>();
  const batch = db.batch();

  while (generatedCodes.length < qty) {
    const codigo = `${cleanPrefix}${generateSecurePinSuffix(8)}`;
    if (usedSet.has(codigo)) continue;
    usedSet.add(codigo);

    const docRef = db.collection('pins').doc(codigo);
    batch.set(docRef, {
      codigo,
      targetType,
      packageId: packageId || null,
      packageName: label,
      tipoPacote: label,
      includeAllContent: Boolean(includeAllContent),
      videoIds: Array.isArray(videoIds) ? videoIds : [],
      videoTitles: Array.isArray(videoTitles) ? videoTitles : [],
      duracaoHoras: hours,
      precoMt: price,
      usado: false,
      usadoPor: null,
      usadoPorTelefone: null,
      usedDeviceId: null,
      usadoEm: null,
      desativado: false,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      expiraEm,
      criadoPor: adminInfo.uid,
    });
    generatedCodes.push(codigo);
  }

  await batch.commit();
  await writeAdminLog(
    adminInfo.uid,
    adminInfo.email,
    'GERAR_PINS',
    `Gerados ${qty} código(s) para "${label}" (${hours}h · ${price} MT)`
  );

  return {
    success: true,
    count: generatedCodes.length,
    codes: generatedCodes,
  };
});

/**
 * Resgata PIN com transação atómica, bloqueio por dispositivo e anti-força bruta.
 */
export const redeemPin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Inicia sessão primeiro.');
  }

  const uid = request.auth.uid;
  const rawData = (request.data || {}) as { codigo?: string; deviceId?: string };
  const rawCode = String(rawData.codigo || '').trim().toUpperCase();
  const reqDeviceId = String(rawData.deviceId || '').trim();

  if (!rawCode || rawCode.length < 4) {
    throw new HttpsError('invalid-argument', 'Código PIN inválido.');
  }

  const attemptRef = db.collection('pinAttempts').doc(uid);
  const attemptSnap = await attemptRef.get();
  const nowMs = Date.now();
  if (attemptSnap.exists) {
    const att = attemptSnap.data()!;
    const blockedUntil = att.blockedUntilMs || 0;
    if (blockedUntil > nowMs) {
      const minsLeft = Math.ceil((blockedUntil - nowMs) / 60000);
      throw new HttpsError(
        'resource-exhausted',
        `Demasiadas tentativas falhadas. Tenta novamente em ${minsLeft} min.`
      );
    }
  }

  const pinRef = db.collection('pins').doc(rawCode);
  const userRef = db.collection('users').doc(uid);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [pinSnap, userSnap] = await Promise.all([tx.get(pinRef), tx.get(userRef)]);

      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'Conta não encontrada.');
      }

      const userData = userSnap.data()!;
      if (userData.isBlocked === true) {
        throw new HttpsError('permission-denied', 'Conta bloqueada. Contacta o suporte.');
      }

      const registeredDevice = userData.deviceId || reqDeviceId;
      if (userData.deviceId && reqDeviceId && userData.deviceId !== reqDeviceId) {
        throw new HttpsError(
          'permission-denied',
          'Esta conta já está em uso noutro dispositivo.'
        );
      }

      if (!pinSnap.exists) {
        throw new HttpsError('not-found', 'Código PIN inválido.');
      }

      const pinData = pinSnap.data()!;
      if (pinData.desativado === true) {
        throw new HttpsError('failed-precondition', 'Código PIN desativado.');
      }
      if (pinData.usado === true) {
        throw new HttpsError('already-exists', 'Este código PIN já foi usado.');
      }

      const pinExpiraMs = pinData.expiraEm?.toMillis ? pinData.expiraEm.toMillis() : nowMs + 1000;
      if (pinExpiraMs < nowMs) {
        throw new HttpsError('deadline-exceeded', 'Este código PIN expirou.');
      }

      let resolvedVideoIds: string[] = Array.isArray(pinData.videoIds) ? pinData.videoIds : [];
      let resolvedIncludeAll = Boolean(pinData.includeAllContent);
      const targetType: PinTargetType = pinData.targetType || (pinData.packageId ? 'package' : 'content');
      const label = pinData.packageName || pinData.tipoPacote || 'Acesso';

      if (targetType === 'package' && pinData.packageId) {
        const pkgSnap = await tx.get(db.collection('packages').doc(pinData.packageId));
        if (pkgSnap.exists) {
          const pkgData = pkgSnap.data()!;
          resolvedIncludeAll = Boolean(pkgData.includeAllContent);
          if (Array.isArray(pkgData.videoIds) && pkgData.videoIds.length > 0) {
            resolvedVideoIds = pkgData.videoIds;
          }
        }
      }

      const hours = Number(pinData.duracaoHoras || 24);
      const addedMs = hours * 60 * 60 * 1000;
      const newExpiresAt = admin.firestore.Timestamp.fromMillis(nowMs + addedMs);

      tx.update(pinRef, {
        usado: true,
        usadoPor: uid,
        usadoPorTelefone: userData.phone || userData.email || null,
        usedDeviceId: registeredDevice || 'verified',
        usadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      const entRef = userRef.collection('entitlements').doc(rawCode);
      tx.set(entRef, {
        pinCode: rawCode,
        userId: uid,
        targetType,
        packageId: pinData.packageId || null,
        packageName: label,
        includeAllContent: resolvedIncludeAll,
        videoIds: resolvedVideoIds,
        duracaoHoras: hours,
        precoMt: Number(pinData.precoMt || 0),
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: newExpiresAt,
        deviceId: registeredDevice || null,
      });

      for (const vid of resolvedVideoIds.slice(0, 40)) {
        const uvRef = userRef.collection('unlockedVideos').doc(vid);
        const uvSnap = await tx.get(uvRef);
        const prevMs = uvSnap.exists && uvSnap.data()?.expiresAt?.toMillis
          ? uvSnap.data()!.expiresAt.toMillis()
          : 0;
        const vidExpMs = Math.max(prevMs, nowMs + addedMs);
        tx.set(uvRef, {
          videoId: vid,
          pinCode: rawCode,
          expiresAt: admin.firestore.Timestamp.fromMillis(vidExpMs),
          deviceId: registeredDevice || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (targetType === 'package') {
        const currentExpMs = userData.packageExpiresAt?.toMillis
          ? userData.packageExpiresAt.toMillis()
          : 0;
        const baseMs = currentExpMs > nowMs ? currentExpMs : nowMs;
        const stackedPkgExp = admin.firestore.Timestamp.fromMillis(baseMs + addedMs);

        tx.update(userRef, {
          currentPackage: label,
          packageExpiresAt: resolvedIncludeAll ? stackedPkgExp : newExpiresAt,
          activePackageId: pinData.packageId || null,
          activePackageExpiresAt: newExpiresAt,
          includeAllContent: Boolean(userData.includeAllContent && currentExpMs > nowMs) || resolvedIncludeAll,
          lastRedeemedPin: rawCode,
          lastPackagePriceMt: Number(pinData.precoMt || 0),
        });
      }

      return {
        label,
        targetType,
        duracaoHoras: hours,
        expiresAtMillis: newExpiresAt.toMillis(),
      };
    });

    await attemptRef.delete().catch(() => undefined);

    return {
      success: true,
      message: `${result.label} ativado por ${result.duracaoHoras}h!`,
      ...result,
    };
  } catch (err) {
    const prev = attemptSnap.exists ? attemptSnap.data()! : { count: 0, windowStartMs: nowMs };
    const withinWindow = nowMs - (prev.windowStartMs || 0) < 15 * 60 * 1000;
    const nextCount = withinWindow ? Number(prev.count || 0) + 1 : 1;
    const blockedUntilMs = nextCount >= 5 ? nowMs + 15 * 60 * 1000 : 0;

    await attemptRef.set({
      count: nextCount,
      windowStartMs: withinWindow ? prev.windowStartMs : nowMs,
      blockedUntilMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (nextCount >= 5) {
      await db.collection('securityAlerts').add({
        type: 'PIN_BRUTE_FORCE',
        userId: uid,
        userContact: request.auth.token.email || uid,
        details: `Bloqueio temporário após ${nextCount} tentativas inválidas de PIN (${rawCode}).`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    throw err;
  }
});

export const blockUser = onCall(async (request) => {
  const adminInfo = await requireAdmin(request);
  const { targetUid, blocked } = (request.data || {}) as {
    targetUid?: string;
    blocked?: boolean;
  };

  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'ID do utilizador obrigatório.');
  }

  const shouldBlock = blocked !== false;
  const userRef = db.collection('users').doc(targetUid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'Utilizador não encontrado.');
  }

  await userRef.update({
    isBlocked: shouldBlock,
  });

  if (shouldBlock) {
    try {
      await admin.auth().revokeRefreshTokens(targetUid);
    } catch {
      // Ignore
    }
    await db.collection('watchSessions').doc(targetUid).delete().catch(() => undefined);
  }

  await writeAdminLog(
    adminInfo.uid,
    adminInfo.email,
    shouldBlock ? 'BLOQUEAR_USUARIO' : 'DESBLOQUEAR_USUARIO',
    `${shouldBlock ? 'Bloqueou' : 'Desbloqueou'} o utilizador ${userSnap.data()?.phone || targetUid}`
  );

  return {
    success: true,
    isBlocked: shouldBlock,
  };
});

export const activatePackageManually = onCall(async (request) => {
  const adminInfo = await requireAdmin(request);
  const {
    phone,
    targetUid,
    tipoPacote,
    packageId = null,
    includeAllContent = true,
    videoIds = [],
    duracaoHoras = 24,
    valorMt = 15,
    transacaoId,
  } = (request.data || {}) as {
    phone?: string;
    targetUid?: string;
    tipoPacote?: string;
    packageId?: string | null;
    includeAllContent?: boolean;
    videoIds?: string[];
    duracaoHoras?: number;
    valorMt?: number;
    transacaoId?: string;
  };

  if (!tipoPacote || !transacaoId?.trim()) {
    throw new HttpsError('invalid-argument', 'Pacote e ID da transação obrigatórios.');
  }

  let userDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  if (targetUid) {
    const snap = await db.collection('users').doc(targetUid).get();
    if (snap.exists) userDoc = snap;
  } else if (phone) {
    const cleanPhone = phone.replace(/\s+/g, '');
    const querySnap = await db.collection('users').where('phone', '==', cleanPhone).limit(1).get();
    if (!querySnap.empty) {
      userDoc = querySnap.docs[0];
    }
  }

  if (!userDoc || !userDoc.exists) {
    throw new HttpsError('not-found', 'Nenhum utilizador encontrado.');
  }

  const userData = userDoc.data()!;
  const uid = userDoc.id;
  const hours = Math.max(1, Number(duracaoHoras || 24));
  const price = Math.max(0, Number(valorMt || 0));

  const nowMs = Date.now();
  const currentExpMs = userData.packageExpiresAt?.toMillis ? userData.packageExpiresAt.toMillis() : 0;
  const baseMs = currentExpMs > nowMs ? currentExpMs : nowMs;
  const newExpiresAt = admin.firestore.Timestamp.fromMillis(baseMs + hours * 60 * 60 * 1000);

  const batch = db.batch();

  if (packageId || includeAllContent) {
    batch.update(userDoc.ref, {
      currentPackage: tipoPacote,
      packageExpiresAt: newExpiresAt,
      activePackageId: packageId || null,
      activePackageExpiresAt: newExpiresAt,
      includeAllContent: Boolean(includeAllContent),
      isBlocked: false,
      lastPackagePriceMt: price,
    });
  }

  const entId = `MANUAL-${Date.now()}`;
  batch.set(userDoc.ref.collection('entitlements').doc(entId), {
    pinCode: entId,
    userId: uid,
    targetType: packageId || includeAllContent ? 'package' : 'content',
    packageId: packageId || null,
    packageName: tipoPacote,
    includeAllContent: Boolean(includeAllContent),
    videoIds: Array.isArray(videoIds) ? videoIds : [],
    duracaoHoras: hours,
    precoMt: price,
    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: newExpiresAt,
  });

  if (Array.isArray(videoIds)) {
    for (const vid of videoIds.slice(0, 40)) {
      batch.set(userDoc.ref.collection('unlockedVideos').doc(vid), {
        videoId: vid,
        pinCode: entId,
        expiresAt: newExpiresAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  const paymentRef = db.collection('manualPayments').doc();
  batch.set(paymentRef, {
    userId: uid,
    telefone: userData.phone || phone || '',
    pacote: tipoPacote,
    valorMt: price,
    transacaoId: transacaoId.trim(),
    ativadoPorUid: adminInfo.uid,
    ativadoPorEmail: adminInfo.email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const notifRef = db.collection('users').doc(uid).collection('notifications').doc();
  batch.set(notifRef, {
    title: 'Acesso Ativado!',
    message: `${tipoPacote} (${price} MT) ativado por ${hours}h (Ref: ${transacaoId.trim()}).`,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  await writeAdminLog(
    adminInfo.uid,
    adminInfo.email,
    'ATIVACAO_MANUAL',
    `Ativou ${tipoPacote} (${price} MT · ${hours}h) para ${userData.phone || uid}`
  );

  return {
    success: true,
    userId: uid,
    telefone: userData.phone,
    pacote: tipoPacote,
    valorMt: price,
    expiresAtMillis: newExpiresAt.toMillis(),
  };
});
