import { fetchLegalDoc } from '@/lib/legal';
import { LegalLayout } from '../termos/page';

export const dynamic = 'force-dynamic';

export default async function PrivacidadePage() {
  const { title, html, version } = await fetchLegalDoc('privacidade');
  return <LegalLayout title={title} html={html} version={version} />;
}
