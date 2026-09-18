/**
 * Journey Valley pour Android — l'agence dans la poche.
 *
 * Une seule application, deux métiers. Le conseiller y retrouve son
 * portefeuille, ses marges et ses devis ; le voyageur son programme, ses
 * documents et son carnet. C'est le serveur qui tranche à la connexion, et
 * l'application se range : le voyageur ne reçoit même pas les montants d'achat.
 *
 * La navigation tient en une barre de trois onglets au pouce, un bouton retour
 * qui recule vraiment, et aucun menu caché. Tout ce qui a été chargé une fois
 * se relit sans réseau, daté — un carnet de voyage doit s'ouvrir dans un avion.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { formatDate, formatDateRange, initials } from "../../src/lib/format";
import { formatMoney } from "../../src/lib/money";
import { formatBytes } from "../../src/lib/attachments";
import {
  ApiError,
  fetchFile,
  fetchHome,
  getSession,
  signIn,
  signOut,
  type Cached,
  type FileDetail,
  type FileSummary,
  type Home,
  type Session,
} from "./client";
import { buildDossier, type MobileDossier } from "./api";
import { networkAllowed, printPage, setNetworkAllowed } from "./net";
import { cacheSize, clearCache, CURRENCY } from "./store";

const STAGE_TONE: Record<string, string> = {
  idea: "bg-stone-100 text-stone-600",
  planning: "bg-amber-100 text-amber-800",
  booked: "bg-brand-100 text-brand-800",
  travelling: "bg-emerald-100 text-emerald-800",
  completed: "bg-stone-100 text-stone-600",
  cancelled: "bg-stone-100 text-stone-400",
};

type Screen =
  | { name: "home" }
  | { name: "file"; id: number }
  | { name: "carnet"; id: number }
  | { name: "money" }
  | { name: "settings" };

function App() {
  const [session, setSession] = useState<Session | null>(() => getSession());
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  // Le bouton retour d'Android recule dans l'application avant d'en sortir.
  useEffect(() => {
    window.JVBack = () => {
      if (screen.name === "home") return false;
      setScreen(screen.name === "carnet" ? { name: "file", id: screen.id } : { name: "home" });
      return true;
    };
    return () => {
      delete window.JVBack;
    };
  }, [screen]);

  if (!session) return <SignIn onSignedIn={setSession} />;

  const advisor = session.user.role === "advisor";

  const body = (() => {
    switch (screen.name) {
      case "home":
        return <HomeScreen advisor={advisor} onOpen={(id) => setScreen({ name: "file", id })} />;
      case "file":
        return (
          <FileScreen
            id={screen.id}
            advisor={advisor}
            onBack={() => setScreen({ name: "home" })}
            onCarnet={() => setScreen({ name: "carnet", id: screen.id })}
          />
        );
      case "carnet":
        return (
          <CarnetScreen id={screen.id} onBack={() => setScreen({ name: "file", id: screen.id })} />
        );
      case "money":
        return <MoneyScreen />;
      case "settings":
        return (
          <SettingsScreen
            session={session}
            onSignedOut={() => {
              signOut();
              setSession(null);
              setScreen({ name: "home" });
            }}
          />
        );
    }
  })();

  const tabs = advisor
    ? ([
        { key: "home", label: "Dossiers", icon: "✈" },
        { key: "money", label: "Marges", icon: "€" },
        { key: "settings", label: "Réglages", icon: "⚙" },
      ] as const)
    : ([
        { key: "home", label: "Mes voyages", icon: "✈" },
        { key: "settings", label: "Réglages", icon: "⚙" },
      ] as const);

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="sticky top-0 z-20 flex items-center gap-2.5 bg-brand-700 px-4 py-3.5 text-white shadow-sm print:hidden">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-xl bg-white/20 text-base">
          ◇
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">
            {session.user.agency?.name ?? "Journey Valley"}
          </p>
          <p className="truncate text-xs text-white/75">
            {advisor ? "Espace conseiller" : "Espace voyageur"}
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4 print:p-0">{body}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] print:hidden">
        {tabs.map((tab) => {
          const active =
            screen.name === tab.key ||
            (tab.key === "home" && (screen.name === "file" || screen.name === "carnet"));
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setScreen({ name: tab.key } as Screen)}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                active ? "text-brand-700" : "text-stone-500"
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* --------------------------------------------------------------- connexion */

function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen flex-col justify-center bg-brand-700 px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <span
            aria-hidden
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/20 text-2xl"
          >
            ◇
          </span>
          <h1 className="mt-3 text-xl font-semibold">Journey Valley</h1>
          <p className="mt-1 text-sm text-white/80">
            Vos dossiers si vous êtes conseiller, vos voyages si vous partez.
          </p>
        </div>

        <form
          className="space-y-4 rounded-2xl bg-white p-5 shadow-lg"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const email = String(data.get("email") ?? "").trim();
            const password = String(data.get("password") ?? "");
            if (!email || !password) return setError("Indiquez votre e-mail et votre mot de passe.");

            setBusy(true);
            setError(null);
            signIn(email, password)
              .then(onSignedIn)
              .catch((failure: unknown) =>
                setError(failure instanceof Error ? failure.message : "Connexion impossible."),
              )
              .finally(() => setBusy(false));
          }}
        >
          <Field label="E-mail">
            <input
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Mot de passe">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </Field>

          {error && <p className="text-sm text-rose-700">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 px-3 py-3.5 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Connexion…" : "Se connecter"}
          </button>
          <p className="text-xs leading-relaxed text-stone-500">
            Le même compte que sur le site. Les conseillers voient les coûts et les marges ; les
            voyageurs voient leur voyage et leur prix.
          </p>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- chargement */

/** Charge une ressource, et dit franchement quand la réponse date. */
function useResource<T>(load: () => Promise<Cached<T>>, deps: unknown[]) {
  const [state, setState] = useState<{
    data: Cached<T> | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });

  const run = useCallback(() => {
    setState((current) => ({ ...current, loading: true }));
    load()
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((failure: unknown) => {
        // Une session expirée ne se rattrape pas : on repart de l'écran de
        // connexion plutôt que d'afficher une erreur qu'on ne peut pas résoudre.
        if (failure instanceof ApiError && failure.status === 401) {
          signOut();
          window.location.reload();
          return;
        }
        setState({
          data: null,
          error: failure instanceof Error ? failure.message : "Chargement impossible.",
          loading: false,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);
  return { ...state, reload: run };
}

function StaleNotice({ at }: { at: number }) {
  return (
    <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
      Hors ligne : voici la dernière version connue, du{" "}
      {formatDate(new Date(at).toISOString().slice(0, 10))}.
    </p>
  );
}

/* ------------------------------------------------------------------ accueil */

function HomeScreen({ advisor, onOpen }: { advisor: boolean; onOpen: (id: number) => void }) {
  const { data, error, loading, reload } = useResource<Home>(fetchHome, []);
  const [query, setQuery] = useState("");

  const files = useMemo(() => {
    const all = data?.value.files ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return all;
    return all.filter((file) =>
      [file.title, file.city, file.country, file.client_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [data, query]);

  if (loading && !data) return <Skeleton />;
  if (error && !data) return <Failure message={error} onRetry={reload} />;
  if (!data) return null;

  const totals = data.value.totals;

  return (
    <div className="space-y-4">
      {data.stale && <StaleNotice at={data.fetched_at} />}

      {advisor && totals && (
        <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-5 py-5 text-white">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-100">
            Marge nette, dossiers réservés
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {formatMoney(totals.margin_net_cents, CURRENCY)}
          </p>
          <p className="mt-1 text-sm text-brand-100">
            {totals.files} dossier{totals.files > 1 ? "s" : ""} ·{" "}
            {formatMoney(totals.sell_cents, CURRENCY)} vendus · {totals.margin_percent} % de marque
          </p>
        </div>
      )}

      {data.value.files.length > 4 && (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Chercher un dossier, un client, une ville"
          aria-label="Chercher"
          className={inputClass}
        />
      )}

      {files.length === 0 ? (
        <Empty
          title={query ? "Rien à ce nom" : advisor ? "Aucun dossier" : "Aucun voyage"}
          hint={
            query
              ? "Essayez une autre orthographe."
              : advisor
                ? "Les dossiers créés sur le site apparaissent ici."
                : "Dès que votre conseiller vous ouvre un dossier, il apparaît ici."
          }
        />
      ) : (
        <ul className="space-y-3">
          {files.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => onOpen(file.id)}
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left shadow-sm active:bg-stone-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-900">{file.title}</p>
                    <p className="truncate text-xs text-stone-500">
                      {file.city}, {file.country}
                      {file.client_name ? ` · ${file.client_name}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {formatDateRange(file.start_date, file.end_date)}
                    </p>
                  </div>
                  <Pill className={STAGE_TONE[file.stage] ?? "bg-stone-100 text-stone-600"}>
                    {file.stage_label}
                  </Pill>
                </div>

                <div className="mt-2 flex items-baseline justify-between text-sm">
                  <span className={file.upcoming ? "font-medium text-brand-700" : "text-stone-400"}>
                    {file.countdown}
                  </span>
                  <MoneyLine file={file} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Le chiffre qui compte, selon qui regarde. */
function MoneyLine({ file }: { file: FileSummary }) {
  if (file.margin_net_cents !== undefined) {
    return (
      <span className={file.margin_firm ? "text-emerald-700" : "text-amber-700"}>
        {file.margin_firm ? "" : "≈ "}
        {formatMoney(file.margin_net_cents, CURRENCY)}
        <span className="ml-1 text-xs text-stone-400">net</span>
      </span>
    );
  }
  if (file.price_cents !== undefined && file.price_cents > 0) {
    return <span className="text-stone-700">{formatMoney(file.price_cents, CURRENCY)}</span>;
  }
  return <span className="text-xs text-stone-400">Devis en préparation</span>;
}

/* -------------------------------------------------------------- un dossier */

function FileScreen({
  id,
  advisor,
  onBack,
  onCarnet,
}: {
  id: number;
  advisor: boolean;
  onBack: () => void;
  onCarnet: () => void;
}) {
  const { data, error, loading, reload } = useResource<FileDetail>(() => fetchFile(id), [id]);
  const [tab, setTab] = useState<"programme" | "money" | "documents" | "destination">("programme");

  if (loading && !data) return <Skeleton />;
  if (error && !data) return <Failure message={error} onRetry={reload} />;
  if (!data) return null;

  const file = data.value;
  const tabs = advisor
    ? ([
        { key: "programme", label: "Programme" },
        { key: "money", label: "Prix" },
        { key: "documents", label: "Documents" },
        { key: "destination", label: "Sur place" },
      ] as const)
    : ([
        { key: "programme", label: "Programme" },
        { key: "documents", label: "Documents" },
        { key: "destination", label: "Sur place" },
      ] as const);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-stone-500">
        ← Retour
      </button>

      {data.stale && <StaleNotice at={data.fetched_at} />}

      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-stone-900">{file.title}</h1>
            <p className="text-sm text-stone-500">
              {file.city}, {file.country}
            </p>
            <p className="text-xs text-stone-400">
              {formatDateRange(file.start_date, file.end_date)} · {file.travellers.length} voyageur
              {file.travellers.length > 1 ? "s" : ""}
            </p>
          </div>
          <Pill className={STAGE_TONE[file.stage] ?? "bg-stone-100 text-stone-600"}>
            {file.stage_label}
          </Pill>
        </div>
        {file.summary && (
          <p className="mt-2.5 text-sm leading-relaxed text-stone-600">{file.summary}</p>
        )}
      </div>

      <nav className="flex gap-1 border-b border-stone-200">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            aria-current={tab === entry.key ? "page" : undefined}
            className={`flex-1 border-b-2 px-2 py-2.5 text-sm font-medium ${
              tab === entry.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-stone-500"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {tab === "programme" && <Programme file={file} />}
      {tab === "money" && <Money file={file} />}
      {tab === "documents" && <Documents file={file} advisor={advisor} onCarnet={onCarnet} />}
      {tab === "destination" && <Destination file={file} />}
    </div>
  );
}

/**
 * Sur place : la page pratique — qui ne demande aucun réseau — et, quand il y
 * en a, la météo, le change et ce qu'il y a à voir. Chargée à la demande : le
 * forfait data du voyageur lui appartient.
 */
function Destination({ file }: { file: FileDetail }) {
  const [dossier, setDossier] = useState<MobileDossier | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // La page pratique est locale : on l'affiche sans rien demander.
    setBusy(true);
    buildDossier({
      destination_city: file.city,
      destination_country: file.country,
      start_date: file.start_date,
      end_date: file.end_date,
    })
      .then(setDossier)
      .finally(() => setBusy(false));
  }, [file.city, file.country, file.start_date, file.end_date]);

  if (busy && !dossier) return <Skeleton />;
  if (!dossier) return <Empty title="Rien à afficher pour cette destination" />;

  const practical = dossier.practical;

  return (
    <div className="space-y-4">
      {practical && (
        <Card title="En cas de pépin">
          <dl className="divide-y divide-stone-100 text-sm">
            {[
              ["Urgences", practical.emergency],
              ["Monnaie", practical.currency],
              ["Prises", `${practical.plugs} · ${practical.voltage}`],
              ["On roule à", practical.drive],
              ["Pourboire", practical.tipping],
              ["Entrée", practical.entry],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {label}
                </dt>
                <dd className="mt-0.5 text-stone-800">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-stone-100 px-4 py-3 text-xs leading-relaxed text-stone-500">
            Disponible sans réseau. Les conditions d'entrée changent : vérifiez avant de partir.
          </p>
        </Card>
      )}

      {dossier.weather && (
        <Card title="Le temps qu'il y fait">
          <div className="px-4 py-3">
            <p className="text-lg font-semibold text-stone-900">
              {dossier.weather.average_min_c} – {dossier.weather.average_max_c} °C
            </p>
            <p className="text-xs text-stone-500">
              {dossier.weather.kind === "forecast"
                ? "Prévisions pour vos dates"
                : "Moyennes des années passées"}{" "}
              · {dossier.weather.rainy_days} jour{dossier.weather.rainy_days > 1 ? "s" : ""} de
              pluie · {dossier.weather.source}
            </p>
          </div>
        </Card>
      )}

      {dossier.exchange && (
        <Card title="Le change">
          <p className="px-4 py-3 text-stone-700">
            1 {CURRENCY} ≈ {dossier.exchange.rate.toFixed(2)} {dossier.exchange.local_currency}{" "}
            <span className="text-xs text-stone-400">(BCE, {dossier.exchange.date})</span>
          </p>
        </Card>
      )}

      {dossier.guide && (
        <Card title={`${file.city}, en deux mots`}>
          <div className="px-4 py-3">
            <p className="text-sm leading-relaxed text-stone-700">{dossier.guide.extract}</p>
            <p className="mt-1 text-xs text-stone-400">{dossier.guide.attribution}</p>
          </div>
        </Card>
      )}

      {dossier.pois.length > 0 && (
        <Card title="À voir">
          <ul className="divide-y divide-stone-100">
            {dossier.pois.map((poi) => (
              <li key={poi.id} className="px-4 py-2.5">
                <a
                  href={poi.website ?? poi.osm_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brand-700 underline"
                >
                  {poi.name}
                </a>
                <span className="text-xs text-stone-500"> · {poi.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dossier.offline && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
          L'accès réseau est désactivé dans les réglages : seule la page pratique est disponible.
        </p>
      )}
    </div>
  );
}

function Programme({ file }: { file: FileDetail }) {
  return (
    <Card title="Jour par jour">
      <ol className="divide-y divide-stone-100">
        {file.days.map((day) => (
          <li key={day.date} className="px-4 py-3">
            <p className="text-sm font-semibold text-stone-900">
              Jour {day.day_number}
              <span className="ml-2 font-normal text-stone-500">{formatDate(day.date)}</span>
            </p>
            {day.entries.length === 0 ? (
              <p className="mt-1 text-sm text-stone-400">Journée libre.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {day.entries.map((entry, index) => (
                  <li
                    key={`${day.date}-${index}`}
                    className={
                      entry.kind === "ongoing" ? "text-xs text-stone-500" : "text-stone-700"
                    }
                  >
                    <strong className="font-medium">{entry.label}</strong>
                    {entry.detail ? ` — ${entry.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Money({ file }: { file: FileDetail }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Vendu" value={formatMoney(file.sell_cents ?? 0, CURRENCY)} />
        <Tile label="Achats" value={formatMoney(file.cost_cents ?? 0, CURRENCY)} />
        <Tile
          label="Marge nette"
          value={formatMoney(file.margin_net_cents ?? 0, CURRENCY)}
          tone={file.margin_firm ? "good" : "warn"}
        />
        <Tile label="Taux de marque" value={`${file.margin_percent ?? 0} %`} />
      </div>

      {!file.margin_firm && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
          Cette marge n'est pas ferme : une ligne attend son prix de vente, ou le dossier n'est pas
          encore entièrement acheté.
        </p>
      )}

      <Card title={`Lignes (${file.bookings.length})`}>
        <ul className="divide-y divide-stone-100">
          {file.bookings.map((booking) => (
            <li key={booking.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-stone-900">{booking.label}</p>
                <p className="text-xs text-stone-500">
                  {formatDate(booking.date)}
                  {booking.detail ? ` · ${booking.detail}` : ""}
                </p>
                {booking.zone === "non_eu" && (
                  <p className="text-xs text-stone-400">Hors UE · marge exonérée</p>
                )}
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className="tabular-nums text-stone-800">
                  {formatMoney(booking.sell_cents ?? 0, CURRENCY)}
                </p>
                <p className="text-xs tabular-nums text-stone-400">
                  achat {formatMoney(booking.cost_cents ?? 0, CURRENCY)}
                </p>
                {booking.cost_origin && (
                  <p className="text-xs text-stone-400">{booking.cost_origin}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {file.quotes && file.quotes.length > 0 && (
        <Card title="Devis">
          <ul className="divide-y divide-stone-100">
            {file.quotes.map((quote) => (
              <li
                key={quote.reference}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-stone-900">{quote.reference}</p>
                  <p className="text-xs text-stone-500">{quote.status_label}</p>
                </div>
                <span className="tabular-nums text-stone-800">
                  {formatMoney(quote.total_cents, CURRENCY)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Documents({
  file,
  advisor,
  onCarnet,
}: {
  file: FileDetail;
  advisor: boolean;
  onCarnet: () => void;
}) {
  const summary = [
    `${file.title} — ${formatDateRange(file.start_date, file.end_date)}`,
    `${file.city}, ${file.country}`,
    "",
    ...file.bookings.map(
      (booking) =>
        `${formatDate(booking.date)} · ${booking.label}${booking.reference ? ` (réf. ${booking.reference})` : ""}`,
    ),
  ].join("\n");

  // Un téléphone peut parler à un serveur plus ancien que lui : un champ qu'il
  // ne connaît pas encore arrive absent, et l'écran ne doit pas s'effondrer
  // pour autant.
  const documents = file.documents ?? [];

  return (
    <div className="space-y-4">
      <Card title={`Réservations (${file.bookings.length})`}>
        {file.bookings.length === 0 ? (
          <p className="px-4 py-4 text-sm text-stone-500">Rien de confirmé pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {file.bookings.map((booking) => (
              <li key={booking.id} className="px-4 py-3">
                <p className="font-medium text-stone-900">{booking.label}</p>
                <p className="text-xs text-stone-500">
                  {formatDate(booking.date)}
                  {booking.detail ? ` · ${booking.detail}` : ""}
                </p>
                {booking.reference && (
                  <p className="text-xs text-brand-700">Référence {booking.reference}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {documents.length > 0 && (
        <Card title={`Pièces (${documents.length})`}>
          <ul className="divide-y divide-stone-100">
            {documents.map((document) => (
              <li key={document.id} className="px-4 py-3">
                <p className="font-medium text-stone-900">{document.name}</p>
                <p className="text-xs text-stone-500">{formatBytes(document.size_bytes)}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-stone-100 px-4 py-3 text-xs leading-relaxed text-stone-500">
            {advisor
              ? "Les pièces du dossier se déposent et se téléchargent depuis le site."
              : "Téléchargez-les depuis votre espace avant de partir : l'application les liste, elle ne les stocke pas encore."}
          </p>
        </Card>
      )}

      {file.checklist.length > 0 && (
        <Card title="Avant de partir">
          <ul className="divide-y divide-stone-100">
            {file.checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span aria-hidden className={item.done ? "text-emerald-600" : "text-stone-300"}>
                  {item.done ? "☑" : "☐"}
                </span>
                <span className={item.done ? "text-stone-400 line-through" : "text-stone-700"}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={onCarnet}
          className="w-full rounded-xl bg-brand-600 px-3 py-3 text-sm font-semibold text-white active:bg-brand-700"
        >
          {advisor ? "Ouvrir le carnet du dossier" : "Ouvrir mon carnet de voyage"}
        </button>
        <ShareButton text={summary} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ carnet */

function CarnetScreen({ id, onBack }: { id: number; onBack: () => void }) {
  const { data, error, loading, reload } = useResource<FileDetail>(() => fetchFile(id), [id]);

  if (loading && !data) return <Skeleton />;
  if (error && !data) return <Failure message={error} onRetry={reload} />;
  if (!data) return null;

  const file = data.value;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <button type="button" onClick={onBack} className="text-sm text-stone-500">
          ← Retour au voyage
        </button>
        <button
          type="button"
          onClick={() => printPage(`Carnet — ${file.title}`)}
          className="rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white active:bg-brand-700"
        >
          Imprimer / PDF
        </button>
      </div>

      <header className="border-b border-stone-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          Carnet de voyage
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-stone-900">{file.title}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {file.city}, {file.country} · {formatDateRange(file.start_date, file.end_date)}
        </p>
        <p className="text-sm text-stone-500">{file.travellers.join(", ")}</p>
      </header>

      <section className="break-inside-avoid">
        <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Le programme
        </h2>
        <ol className="space-y-2">
          {file.days.map((day) => (
            <li key={day.date} className="text-sm">
              <p className="font-medium text-stone-900">
                Jour {day.day_number}
                <span className="ml-2 font-normal text-stone-500">{formatDate(day.date)}</span>
              </p>
              {day.entries.length === 0 ? (
                <p className="text-stone-400">Libre.</p>
              ) : (
                <ul className="text-stone-700">
                  {day.entries.map((entry, index) => (
                    <li key={index}>
                      {entry.label}
                      {entry.detail ? ` — ${entry.detail}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="break-inside-avoid">
        <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Les réservations
        </h2>
        <ul className="space-y-1 text-sm text-stone-700">
          {file.bookings.map((booking) => (
            <li key={booking.id}>
              {formatDate(booking.date)} · <strong className="font-medium">{booking.label}</strong>
              {booking.detail ? ` — ${booking.detail}` : ""}
              {booking.reference ? ` · réf. ${booking.reference}` : ""}
            </li>
          ))}
        </ul>
      </section>

      {file.checklist.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Avant de partir
          </h2>
          <ul className="space-y-1 text-sm text-stone-700">
            {file.checklist.map((item) => (
              <li key={item.id}>
                {item.done ? "☑" : "☐"} {item.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-stone-400">
        Journey Valley · carnet du {formatDate(new Date().toISOString().slice(0, 10))}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ marges */

function MoneyScreen() {
  const { data, error, loading, reload } = useResource<Home>(fetchHome, []);

  if (loading && !data) return <Skeleton />;
  if (error && !data) return <Failure message={error} onRetry={reload} />;
  if (!data?.value.totals) return <Empty title="Rien à afficher" />;

  const totals = data.value.totals;
  const firm = data.value.files.filter((file) => file.margin_firm);
  const toConfirm = data.value.files.filter((file) => file.margin_firm === false);

  return (
    <div className="space-y-4">
      {data.stale && <StaleNotice at={data.fetched_at} />}

      <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-5 py-5 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-100">
          Marge nette, après TVA sur marge
        </p>
        <p className="mt-1 text-3xl font-semibold">
          {formatMoney(totals.margin_net_cents, CURRENCY)}
        </p>
        <p className="mt-1 text-sm text-brand-100">
          {formatMoney(totals.sell_cents, CURRENCY)} vendus ·{" "}
          {formatMoney(totals.vat_cents, CURRENCY)} de TVA · {totals.margin_percent} % de marque
        </p>
      </div>

      {toConfirm.length > 0 && (
        <Card title={`Marges à confirmer (${toConfirm.length})`}>
          <p className="px-4 pt-3 text-xs leading-relaxed text-stone-500">
            Une ligne sans prix de vente tire la marge vers le bas ; un forfait pas encore acheté la
            gonfle.
          </p>
          <ul className="mt-2 divide-y divide-stone-100">
            {toConfirm.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="truncate text-stone-800">{file.title}</span>
                <span className="shrink-0 tabular-nums text-amber-700">
                  ≈ {formatMoney(file.margin_net_cents ?? 0, CURRENCY)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`Dossiers fermes (${firm.length})`}>
        {firm.length === 0 ? (
          <p className="px-4 py-4 text-sm text-stone-500">Aucun dossier ferme pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {firm.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-stone-800">{file.title}</p>
                  <p className="text-xs text-stone-500">
                    {formatMoney(file.sell_cents ?? 0, CURRENCY)} vendus · {file.margin_percent} %
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-emerald-700">
                  {formatMoney(file.margin_net_cents ?? 0, CURRENCY)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- réglages */

function SettingsScreen({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const [network, setNetwork] = useState(networkAllowed());
  const [cached, setCached] = useState(cacheSize());

  return (
    <div className="space-y-4">
      <Card title="Votre compte">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
            {initials(session.user.name)}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-stone-900">{session.user.name}</p>
            <p className="truncate text-xs text-stone-500">{session.user.email}</p>
            <p className="text-xs text-stone-400">
              {session.user.role === "advisor" ? "Conseiller" : "Voyageur"}
              {session.user.agency ? ` · ${session.user.agency.name}` : ""}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Réseau">
        <label className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm text-stone-800">Autoriser les services en ligne</span>
          <input
            type="checkbox"
            checked={network}
            onChange={(event) => {
              setNetworkAllowed(event.target.checked);
              setNetwork(event.target.checked);
            }}
            className="h-5 w-5 rounded border-stone-300"
          />
        </label>
        <p className="border-t border-stone-100 px-4 py-3 text-xs leading-relaxed text-stone-500">
          L'application ne parle qu'au serveur de votre agence et à six services libres — météo,
          taux de change, cartes, encyclopédie. La liste est compilée dans l'application : rien
          d'autre n'est joignable.
        </p>
        {cached > 0 && (
          <div className="border-t border-stone-100 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                clearCache();
                setCached(0);
              }}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100"
            >
              Vider le cache ({cached} réponse{cached > 1 ? "s" : ""})
            </button>
          </div>
        )}
      </Card>

      <button
        type="button"
        onClick={() => {
          if (confirm("Se déconnecter de cet appareil ?")) onSignedOut();
        }}
        className="w-full rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-rose-700 active:bg-rose-50"
      >
        Se déconnecter
      </button>

      <p className="text-xs leading-relaxed text-stone-500">
        La déconnexion efface la session et tout ce qui était gardé pour le mode hors-ligne.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- bits */

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-brand-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tile({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn";
}) {
  const ring =
    tone === "good"
      ? "bg-emerald-50 ring-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 ring-amber-200"
        : "bg-white ring-stone-200";
  return (
    <div className={`rounded-2xl px-3.5 py-3 shadow-sm ring-1 ring-inset ${ring}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-stone-900">{value}</p>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function ShareButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        // La coque Android ouvre le partage du système ; un navigateur copie.
        if (window.JVShare) {
          window.JVShare.text(text);
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          setCopied(false);
        }
      }}
      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100"
    >
      {copied ? "Copié ✓" : "Partager les références"}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-24 animate-pulse rounded-2xl bg-stone-200/70" />
      ))}
    </div>
  );
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center">
      <p className="font-medium text-stone-700">Chargement impossible</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-stone-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100"
      >
        Réessayer
      </button>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-10 text-center">
      <p className="font-medium text-stone-700">{title}</p>
      {hint && <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{hint}</p>}
    </div>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<App />);
