/**
 * Les messages que l'agence envoie.
 *
 * Ce module est pur : il compose un objet, un texte et l'enveloppe RFC 5322 —
 * il n'ouvre aucune connexion. Ce qui part par le réseau vit dans `smtp.ts`,
 * ce qui est mis en file vit dans `mail-store.ts`. La séparation n'est pas une
 * coquetterie : elle rend le contenu des messages testable sur une machine
 * sans réseau sortant, ce qui est le cas ici.
 *
 * Deux règles de fond :
 *
 * 1. **Un message ne porte jamais un coût d'achat ni une marge.** Comme pour
 *    les documents, ce n'est pas un `if` : les fonctions ne reçoivent que ce
 *    qui est déjà public.
 * 2. **Le lien vaut authentification.** Un jeton de devis, de facture ou de
 *    réinitialisation ouvre exactement une chose ; il ne se devine pas et ne
 *    se réutilise pas.
 */

export type MessageKind = "quote" | "invoice" | "reset" | "invite";

export interface Composed {
  subject: string;
  body: string;
}

export interface Recipient {
  name: string;
  email: string;
}

/* ------------------------------------------------------------- enveloppe */

/**
 * Un en-tête non-ASCII s'encode, sinon un serveur le coupe ou l'abîme.
 * RFC 2047, en base64 : c'est ce qui passe partout.
 */
export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** `Camille Roy <camille@agence.fr>`, avec le nom encodé au besoin. */
export function formatAddress(person: Recipient): string {
  if (!person.name) return person.email;
  return `${encodeHeader(person.name)} <${person.email}>`;
}

/** Le corps passe en base64 : les accents survivent à n'importe quel relais. */
function encodeBody(text: string): string {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  return (encoded.match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * Le message complet, prêt pour la commande DATA.
 *
 * Les lignes sont terminées par CRLF parce que le protocole l'exige, et un
 * point en début de ligne serait pris pour la fin des données — le corps étant
 * en base64, le cas ne se présente pas, mais le texte des en-têtes est nettoyé
 * de ses retours à la ligne pour qu'on ne puisse pas en injecter.
 */
export function buildMessage(input: {
  from: Recipient;
  to: Recipient;
  replyTo?: Recipient | null;
  subject: string;
  body: string;
  date?: Date;
}): string {
  const clean = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

  const headers = [
    `From: ${clean(formatAddress(input.from))}`,
    `To: ${clean(formatAddress(input.to))}`,
    ...(input.replyTo ? [`Reply-To: ${clean(formatAddress(input.replyTo))}`] : []),
    `Subject: ${clean(encodeHeader(input.subject))}`,
    `Date: ${(input.date ?? new Date()).toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];

  return `${headers.join("\r\n")}\r\n\r\n${encodeBody(input.body)}\r\n`;
}

/* ---------------------------------------------------------------- textes */

function signature(agencyName: string, advisor: Recipient | null): string {
  const who = advisor?.name ? `${advisor.name}\n${agencyName}` : agencyName;
  return `\n\n—\n${who}`;
}

/** Le message qui accompagne un devis. Le lien public y fait tout le travail. */
export function composeQuote(input: {
  client: Recipient;
  agencyName: string;
  advisor: Recipient | null;
  reference: string;
  title: string;
  /** L'adresse complète du devis public, jeton compris. */
  url: string;
  validUntil: string | null;
  intro: string;
}): Composed {
  const lines = [
    `Bonjour ${input.client.name},`,
    "",
    input.intro.trim() ||
      `Voici votre devis pour ${input.title}, comme convenu.`,
    "",
    `Vous pouvez le consulter, le télécharger en PDF et y répondre ici :`,
    input.url,
    "",
    ...(input.validUntil ? [`Ce devis est valable jusqu'au ${input.validUntil}.`, ""] : []),
    "Le formulaire d'information standardisé et nos conditions y sont joints.",
    "Je reste à votre disposition pour en discuter.",
  ];

  return {
    subject: `Votre devis ${input.reference} — ${input.title}`,
    body: lines.join("\n") + signature(input.agencyName, input.advisor),
  };
}

/** Le message qui accompagne une facture. Aucun montant de TVA, jamais. */
export function composeInvoice(input: {
  client: Recipient;
  agencyName: string;
  advisor: Recipient | null;
  reference: string;
  kindLabel: string;
  amount: string;
  dueDate: string | null;
  url: string;
}): Composed {
  const lines = [
    `Bonjour ${input.client.name},`,
    "",
    `Veuillez trouver votre ${input.kindLabel.toLowerCase()} ${input.reference}, ` +
      `d'un montant de ${input.amount}.`,
    "",
    ...(input.dueDate ? [`Échéance de règlement : ${input.dueDate}.`, ""] : []),
    "Elle est consultable et téléchargeable en PDF ici :",
    input.url,
  ];

  return {
    subject: `${input.kindLabel} ${input.reference}`,
    body: lines.join("\n") + signature(input.agencyName, input.advisor),
  };
}

/**
 * Le message de réinitialisation.
 *
 * Il ne dit jamais si l'adresse a un compte — c'est l'écran qui reste muet —
 * et le lien est court-vivant, parce qu'un lien de réinitialisation traîne
 * dans une boîte mail bien plus longtemps qu'il ne devrait.
 */
export function composeReset(input: {
  user: Recipient;
  url: string;
  hours: number;
}): Composed {
  const lines = [
    `Bonjour ${input.user.name},`,
    "",
    "Vous avez demandé à choisir un nouveau mot de passe. Ce lien vous y mène :",
    input.url,
    "",
    `Il est valable ${input.hours} heure${input.hours > 1 ? "s" : ""}, et ne sert qu'une fois.`,
    "",
    "Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel",
    "reste valable et personne n'a été prévenu de cette demande.",
    "",
    "—\nJourney Valley",
  ];

  return { subject: "Choisir un nouveau mot de passe", body: lines.join("\n") };
}

/** L'invitation qu'un conseiller envoie à son client pour qu'il ait un accès. */
export function composeInvite(input: {
  client: Recipient;
  agencyName: string;
  advisor: Recipient | null;
  url: string;
  days: number;
}): Composed {
  const lines = [
    `Bonjour ${input.client.name},`,
    "",
    `${input.agencyName} vous ouvre un accès à votre espace voyageur : votre programme,`,
    "vos réservations, votre carnet de voyage et vos documents, sur ordinateur",
    "comme sur téléphone.",
    "",
    "Choisissez votre mot de passe ici :",
    input.url,
    "",
    `Ce lien vous est personnel et reste valable ${input.days} jours.`,
  ];

  return {
    subject: `Votre espace voyageur chez ${input.agencyName}`,
    body: lines.join("\n") + signature(input.agencyName, input.advisor),
  };
}

/** Ce qu'on montre dans la file d'attente : une ligne, lisible. */
export const KIND_LABEL: Record<MessageKind, string> = {
  quote: "Devis",
  invoice: "Facture",
  reset: "Mot de passe",
  invite: "Invitation",
};
