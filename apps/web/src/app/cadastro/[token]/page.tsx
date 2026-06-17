'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, FileText, Loader2, Plus, Trash2, Upload, UserRound } from 'lucide-react';
import { AdelinaMark } from '@/components/brand/Logo';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface PublicInfo {
  pousada: string;
  phone: string;
  status: string;
  reservation: { code: string; checkIn: string; checkOut: string } | null;
}

interface Companion {
  fullName: string;
  documentType: string;
  document: string;
  birthDate: string;
}

const EMPTY_COMPANION: Companion = { fullName: '', documentType: 'cpf', document: '', birthDate: '' };

interface Address {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

const EMPTY_ADDRESS: Address = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

export default function CadastroPage() {
  const { token } = useParams<{ token: string }>();

  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState('');
  const [documentType, setDocumentType] = useState('cpf');
  const [document_, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [nationality, setNationality] = useState('BR');
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [file, setFile] = useState<{ base64: string; name: string; mime: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [companions, setCompanions] = useState<Companion[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/guest-links/public/${token}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? 'Link inválido');
        setInfo(json);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function onCepChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setCepError(null);
    setAddress((a) => ({ ...a, cep: masked }));
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError('CEP não encontrado.');
        return;
      }
      setAddress((a) => ({
        ...a,
        street: data.logradouro || a.street,
        neighborhood: data.bairro || a.neighborhood,
        city: data.localidade || a.city,
        state: data.uf || a.state,
      }));
    } catch {
      setCepError('Não foi possível buscar o CEP. Preencha manualmente.');
    } finally {
      setCepLoading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const f = e.target.files?.[0];
    if (!f) return setFile(null);
    if (f.size > MAX_FILE_BYTES) {
      setFileError('Arquivo muito grande — máximo 8MB.');
      return setFile(null);
    }
    const reader = new FileReader();
    reader.onload = () => setFile({ base64: String(reader.result), name: f.name, mime: f.type });
    reader.readAsDataURL(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/guest-links/public/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          documentType,
          document: document_.trim(),
          email: email.trim() || undefined,
          birthDate: birthDate || undefined,
          nationality: nationality.trim() || undefined,
          address:
            address.cep || address.street || address.city
              ? {
                  cep: address.cep || undefined,
                  street: address.street.trim() || undefined,
                  number: address.number.trim() || undefined,
                  complement: address.complement.trim() || undefined,
                  neighborhood: address.neighborhood.trim() || undefined,
                  city: address.city.trim() || undefined,
                  state: address.state.trim() || undefined,
                }
              : undefined,
          documentFile: file ?? undefined,
          companions: companions
            .filter((c) => c.fullName.trim())
            .map((c) => ({
              fullName: c.fullName.trim(),
              documentType: c.documentType,
              document: c.document.trim() || undefined,
              birthDate: c.birthDate || undefined,
            })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Falha ao enviar ficha');
      setDone(true);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-8 sm:py-12">
      <div className="max-w-lg mx-auto">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center text-center mb-6">
          <AdelinaMark className="w-12 h-12 rounded-xl shadow-md mb-3" />
          {info && (
            <>
              <h1 className="font-display text-2xl font-bold text-ink tracking-tight">
                {info.pousada}
              </h1>
              <p className="text-sm text-ink-soft mt-1">Ficha de cadastro do hóspede</p>
              {info.reservation && (
                <p className="text-xs text-ink-muted mt-2 px-3 py-1.5 rounded-full bg-surface-sunken inline-flex items-center gap-1.5">
                  Reserva <span className="font-mono font-semibold">{info.reservation.code}</span>
                  {' · '}
                  {formatDate(info.reservation.checkIn)} → {formatDate(info.reservation.checkOut)}
                </p>
              )}
            </>
          )}
        </div>

        {loading && (
          <div className="surface-card p-8 text-center text-ink-muted text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Carregando…
          </div>
        )}

        {loadError && (
          <div className="surface-card p-8 text-center space-y-2">
            <p className="text-ink font-semibold">Ops!</p>
            <p className="text-sm text-ink-soft">{loadError}</p>
          </div>
        )}

        {done && (
          <div className="surface-card p-10 text-center space-y-3 animate-scale-in">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Ficha enviada!</h2>
            <p className="text-sm text-ink-soft max-w-xs mx-auto">
              Obrigado! Seus dados foram recebidos pela pousada. Até breve! 🏡
            </p>
          </div>
        )}

        {info && !done && (
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Hóspede principal */}
            <section className="surface-card p-5 space-y-3">
              <h2 className="font-semibold text-ink flex items-center gap-2 text-sm uppercase tracking-wider">
                <UserRound className="w-4 h-4 text-brand-600" /> Seus dados
              </h2>

              <Field label="Nome completo *">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-base"
                  autoComplete="name"
                />
              </Field>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Documento *">
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="input-base"
                  >
                    <option value="cpf">CPF</option>
                    <option value="rg">RG</option>
                    <option value="passport">Passaporte</option>
                    <option value="cnh">CNH</option>
                    <option value="other">Outro</option>
                  </select>
                </Field>
                <div className="col-span-2">
                  <Field label="Número *">
                    <input
                      type="text"
                      required
                      value={document_}
                      onChange={(e) => setDocument(e.target.value)}
                      className="input-base"
                    />
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nascimento">
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="input-base"
                  />
                </Field>
                <Field label="Nacionalidade">
                  <input
                    type="text"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    className="input-base"
                  />
                </Field>
              </div>

              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-base"
                  autoComplete="email"
                />
              </Field>

              <div className="pt-2 mt-1 border-t border-line space-y-3">
                <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider pt-1">
                  Endereço
                </p>

                <Field label="CEP">
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={address.cep}
                      onChange={(e) => onCepChange(e.target.value)}
                      placeholder="00000-000"
                      className="input-base"
                      autoComplete="postal-code"
                    />
                    {cepLoading && (
                      <Loader2 className="w-4 h-4 animate-spin text-brand-500 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                  {cepError && <p className="text-xs text-red-600 mt-1">{cepError}</p>}
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem] gap-3">
                  <Field label="Rua / Logradouro">
                    <input
                      type="text"
                      value={address.street}
                      onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                      className="input-base"
                      autoComplete="address-line1"
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={address.number}
                      onChange={(e) => setAddress((a) => ({ ...a, number: e.target.value }))}
                      className="input-base"
                    />
                  </Field>
                </div>

                <Field label="Complemento">
                  <input
                    type="text"
                    value={address.complement}
                    onChange={(e) => setAddress((a) => ({ ...a, complement: e.target.value }))}
                    placeholder="Apto, bloco, referência (opcional)"
                    className="input-base"
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Bairro">
                    <input
                      type="text"
                      value={address.neighborhood}
                      onChange={(e) => setAddress((a) => ({ ...a, neighborhood: e.target.value }))}
                      className="input-base"
                    />
                  </Field>
                  <div className="grid grid-cols-[1fr_4.5rem] gap-3">
                    <Field label="Cidade">
                      <input
                        type="text"
                        value={address.city}
                        onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                        className="input-base"
                      />
                    </Field>
                    <Field label="UF">
                      <input
                        type="text"
                        maxLength={2}
                        value={address.state}
                        onChange={(e) =>
                          setAddress((a) => ({ ...a, state: e.target.value.toUpperCase() }))
                        }
                        className="input-base uppercase"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </section>

            {/* Documento com foto */}
            <section className="surface-card p-5 space-y-3">
              <h2 className="font-semibold text-ink flex items-center gap-2 text-sm uppercase tracking-wider">
                <FileText className="w-4 h-4 text-brand-600" /> Foto do documento
              </h2>
              <p className="text-xs text-ink-muted">
                Foto ou PDF do documento (frente). Máximo 8MB.
              </p>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-line rounded-xl p-5 cursor-pointer hover:border-brand-400 transition-colors text-sm text-ink-soft">
                <Upload className="w-4 h-4" />
                {file ? file.name : 'Toque para escolher o arquivo'}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={onFileChange}
                  className="hidden"
                />
              </label>
              {fileError && <p className="text-xs text-red-600">{fileError}</p>}
            </section>

            {/* Acompanhantes */}
            <section className="surface-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink text-sm uppercase tracking-wider">
                  Acompanhantes
                </h2>
                <button
                  type="button"
                  onClick={() => setCompanions((c) => [...c, { ...EMPTY_COMPANION }])}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
              {companions.length === 0 && (
                <p className="text-xs text-ink-muted">
                  Vai se hospedar com mais alguém? Adicione cada pessoa aqui.
                </p>
              )}
              {companions.map((c, i) => (
                <div key={i} className="rounded-xl bg-surface-sunken/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-muted">
                      Acompanhante {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCompanions((arr) => arr.filter((_, j) => j !== i))}
                      className="text-red-500 hover:text-red-700 p-1"
                      aria-label="Remover acompanhante"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={c.fullName}
                    onChange={(e) =>
                      setCompanions((arr) =>
                        arr.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)),
                      )
                    }
                    className="input-base"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="CPF / documento"
                      value={c.document}
                      onChange={(e) =>
                        setCompanions((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, document: e.target.value } : x)),
                        )
                      }
                      className="input-base"
                    />
                    <input
                      type="date"
                      value={c.birthDate}
                      onChange={(e) =>
                        setCompanions((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, birthDate: e.target.value } : x)),
                        )
                      }
                      className="input-base"
                    />
                  </div>
                </div>
              ))}
            </section>

            {submitError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {submitError}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Enviando…
                </>
              ) : (
                'Enviar ficha'
              )}
            </button>

            <p className="text-[11px] text-ink-muted text-center pb-4">
              Seus dados são enviados com segurança e usados apenas pela pousada.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
