import { MessageCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { buildWhatsAppUrl } from '../utils/formatters';

export function WhatsAppFloatingButton() {
  const { settings, profile } = useAuth();
  const message = profile?.phone
    ? `Olá suporte ${settings.appName}, conta: ${profile.phone}.`
    : `Olá suporte ${settings.appName}.`;

  return (
    <a
      href={buildWhatsAppUrl(settings.supportWhatsapp, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Suporte WhatsApp"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold shadow-lg border border-white/15 transition-transform duration-150 hover:scale-105"
    >
      <MessageCircle className="w-4 h-4 shrink-0" />
      <span className="hidden sm:inline whitespace-nowrap">Suporte</span>
    </a>
  );
}
