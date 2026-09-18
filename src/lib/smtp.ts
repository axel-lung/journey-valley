import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

/**
 * Un client SMTP minimal.
 *
 * Journey Valley n'envoie que quatre sortes de messages, en texte, un à la
 * fois. Ça ne justifie pas une dépendance : il faut savoir dire EHLO, passer
 * en TLS, s'authentifier, et pousser un message. C'est ce que fait ce fichier,
 * et rien d'autre.
 *
 * ⚠️ **Le dialogue réseau n'est pas couvert par les tests.** La machine de
 * développement n'a pas de réseau sortant, et un test qui simulerait un
 * serveur ne prouverait que la simulation. Ce qui est testé, c'est ce qui est
 * pur : la lecture de l'URL de configuration (`parseSmtpUrl`) et la
 * composition du message (`mail.ts`). Le reste se vérifie contre un vrai
 * serveur, à la première configuration — et l'écran de réglages affiche
 * l'erreur telle que le serveur la renvoie, pour que ce soit diagnosticable.
 *
 * Configuration, par une seule variable d'environnement :
 *
 *     JV_SMTP_URL=smtps://utilisateur:motdepasse@smtp.exemple.fr:465
 *     JV_SMTP_URL=smtp://utilisateur:motdepasse@smtp.exemple.fr:587   (STARTTLS)
 *     JV_MAIL_FROM="Escale Voyages <contact@escale.fr>"
 *
 * Sans elle, rien ne part : les messages restent en file, visibles et
 * copiables dans l'application. Une agence qui n'a pas encore branché son
 * serveur peut travailler ; elle voit juste que rien n'est parti.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  /** Vrai pour une connexion chiffrée d'emblée (465) ; sinon STARTTLS. */
  implicitTls: boolean;
  user: string;
  password: string;
}

export class SmtpError extends Error {
  constructor(
    message: string,
    readonly code: number | null = null,
  ) {
    super(message);
    this.name = "SmtpError";
  }
}

/**
 * Lit l'URL de configuration.
 *
 * Renvoie `null` plutôt que de jeter quand la variable est absente : ne pas
 * avoir configuré l'envoi est un état normal du produit, pas une panne.
 */
export function parseSmtpUrl(raw: string | undefined): SmtpConfig | null {
  if (!raw || !raw.trim()) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SmtpError(`Adresse SMTP illisible : ${raw}`);
  }

  const implicitTls = url.protocol === "smtps:";
  if (!implicitTls && url.protocol !== "smtp:") {
    throw new SmtpError(`Protocole inattendu : ${url.protocol} (attendu smtp: ou smtps:)`);
  }
  if (!url.hostname) throw new SmtpError("Adresse SMTP sans serveur.");

  return {
    host: url.hostname,
    port: Number(url.port) || (implicitTls ? 465 : 587),
    implicitTls,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/** La configuration lue dans l'environnement, ou null si l'envoi n'est pas branché. */
export function smtpFromEnv(): SmtpConfig | null {
  return parseSmtpUrl(process.env.JV_SMTP_URL);
}

/** L'expéditeur que le serveur acceptera ; l'agence peut le surcharger. */
export function defaultSender(fallbackEmail: string): { name: string; email: string } {
  const raw = (process.env.JV_MAIL_FROM ?? "").trim();
  const match = /^(.*?)\s*<([^>]+)>$/.exec(raw);
  if (match) return { name: match[1].replace(/^"|"$/g, ""), email: match[2] };
  if (raw.includes("@")) return { name: "", email: raw };
  return { name: "", email: fallbackEmail };
}

/* ------------------------------------------------------------- dialogue */

/** Une conversation ligne à ligne, avec un délai qui ne laisse rien pendre. */
class Conversation {
  private buffer = "";
  private waiting: ((line: string) => void) | null = null;
  private failure: Error | null = null;

  constructor(
    private socket: Socket,
    private readonly timeoutMs: number,
  ) {
    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk: string) => this.absorb(chunk));
    socket.on("timeout", () => this.fail(new SmtpError("Le serveur SMTP n'a pas répondu à temps.")));
    socket.on("error", (error: Error) => this.fail(error));
  }

  /** Remplace la socket après STARTTLS, en gardant l'état de lecture. */
  upgrade(socket: Socket): void {
    this.socket = socket;
    this.buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(this.timeoutMs);
    socket.on("data", (chunk: string) => this.absorb(chunk));
    socket.on("timeout", () => this.fail(new SmtpError("Le serveur SMTP n'a pas répondu à temps.")));
    socket.on("error", (error: Error) => this.fail(error));
  }

  private absorb(chunk: string): void {
    this.buffer += chunk;
    // Une réponse peut tenir sur plusieurs lignes : `250-…` continue,
    // `250 …` conclut. On ne rend la main que sur la dernière.
    const match = /^(?:\d{3}-[^\n]*\n)*(\d{3}) [^\n]*\n/.exec(this.buffer);
    if (!match || !this.waiting) return;

    const reply = this.buffer.slice(0, match[0].length);
    this.buffer = this.buffer.slice(match[0].length);
    const resolve = this.waiting;
    this.waiting = null;
    resolve(reply);
  }

  private fail(error: Error): void {
    this.failure = error;
    this.socket.destroy();
  }

  async expect(codes: number[]): Promise<string> {
    const reply = await new Promise<string>((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      this.waiting = resolve;
      this.socket.once("close", () =>
        reject(this.failure ?? new SmtpError("Le serveur SMTP a coupé la connexion.")),
      );
      // Ce qui est déjà arrivé compte : on relit le tampon sans attendre.
      this.absorb("");
    });

    const code = Number(reply.slice(-4, -1) || reply.slice(0, 3));
    if (!codes.includes(code)) {
      throw new SmtpError(reply.trim(), code);
    }
    return reply;
  }

  send(line: string): void {
    this.socket.write(`${line}\r\n`);
  }

  end(): void {
    this.socket.end();
  }
}

function open(config: SmtpConfig, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = config.implicitTls
      ? tlsConnect({ host: config.host, port: config.port, servername: config.host }, () =>
          resolve(socket),
        )
      : netConnect({ host: config.host, port: config.port }, () => resolve(socket));

    socket.setTimeout(timeoutMs);
    socket.once("error", reject);
    socket.once("timeout", () =>
      reject(new SmtpError(`Connexion à ${config.host}:${config.port} expirée.`)),
    );
  });
}

/**
 * Envoie un message déjà composé.
 *
 * Jette une `SmtpError` portant la réponse du serveur : c'est elle qu'on
 * affiche au conseiller, parce que « 535 authentification refusée » se corrige
 * et « l'envoi a échoué » ne se corrige pas.
 */
export async function sendMail(input: {
  config: SmtpConfig;
  from: string;
  to: string;
  /** Le message complet, en-têtes compris, tel que `buildMessage` le rend. */
  message: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = input.timeoutMs ?? 20_000;
  const socket = await open(input.config, timeoutMs);
  const talk = new Conversation(socket, timeoutMs);

  try {
    await talk.expect([220]);
    talk.send(`EHLO ${hostnameFor(input.from)}`);
    let greeting = await talk.expect([250]);

    if (!input.config.implicitTls) {
      if (!/STARTTLS/i.test(greeting)) {
        throw new SmtpError("Le serveur refuse le chiffrement (pas de STARTTLS).");
      }
      talk.send("STARTTLS");
      await talk.expect([220]);

      const secure = await new Promise<Socket>((resolve, reject) => {
        const upgraded = tlsConnect({ socket, servername: input.config.host }, () =>
          resolve(upgraded),
        );
        upgraded.once("error", reject);
      });
      talk.upgrade(secure);

      talk.send(`EHLO ${hostnameFor(input.from)}`);
      greeting = await talk.expect([250]);
    }

    if (input.config.user) {
      // AUTH LOGIN : l'identifiant et le mot de passe, en base64, l'un après
      // l'autre. Universellement accepté, contrairement à AUTH PLAIN sur
      // certains serveurs français.
      talk.send("AUTH LOGIN");
      await talk.expect([334]);
      talk.send(Buffer.from(input.config.user, "utf8").toString("base64"));
      await talk.expect([334]);
      talk.send(Buffer.from(input.config.password, "utf8").toString("base64"));
      await talk.expect([235]);
    }

    talk.send(`MAIL FROM:<${input.from}>`);
    await talk.expect([250]);
    talk.send(`RCPT TO:<${input.to}>`);
    await talk.expect([250, 251]);
    talk.send("DATA");
    await talk.expect([354]);

    // Un point seul en début de ligne terminerait les données avant l'heure.
    talk.send(`${input.message.replace(/\r?\n\./g, "\r\n..")}\r\n.`);
    await talk.expect([250]);

    talk.send("QUIT");
  } finally {
    talk.end();
  }
}

/** Le domaine annoncé dans EHLO : celui de l'expéditeur, à défaut de mieux. */
function hostnameFor(from: string): string {
  const domain = from.split("@")[1];
  return domain && /^[a-z0-9.-]+$/i.test(domain) ? domain : "localhost";
}
