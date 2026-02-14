import { ImapFlow } from "imapflow";

export interface EmailAccount {
  user: string;
  password: string;
  label: string;
}

export interface FetchedEmail {
  uid: number;
  from: string;
  subject: string;
  raw: Buffer;
}

const PAYMENT_SENDERS = [
  "venmo@venmo.com",
  "cash@square.com",
  "service@paypal.com",
  "customerservice@ealerts.bankofamerica.com",
];

function getEmailAccounts(): EmailAccount[] {
  const accounts: EmailAccount[] = [];

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    accounts.push({
      user: process.env.GMAIL_USER,
      password: process.env.GMAIL_APP_PASSWORD,
      label: "GMAIL_USER (Cash App)",
    });
  }

  if (process.env.GMAIL_USER2 && process.env.GMAIL_APP_PASSWORD2) {
    accounts.push({
      user: process.env.GMAIL_USER2,
      password: process.env.GMAIL_APP_PASSWORD2,
      label: "GMAIL_USER2 (Venmo/PayPal)",
    });
  }

  if (process.env.GMAIL_USER3 && process.env.GMAIL_APP_PASSWORD3) {
    accounts.push({
      user: process.env.GMAIL_USER3,
      password: process.env.GMAIL_APP_PASSWORD3,
      label: "GMAIL_USER3 (Zelle)",
    });
  }

  return accounts;
}

async function fetchUnreadPaymentEmails(
  account: EmailAccount
): Promise<FetchedEmail[]> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: account.user,
      pass: account.password,
    },
    logger: false,
  });

  const emails: FetchedEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      for (const sender of PAYMENT_SENDERS) {
        const results = await client.search({
          from: sender,
          seen: false,
        });

        if (!results || !results.length) continue;

        for (const uid of results) {
          const message = await client.fetchOne(String(uid), {
            source: true,
            envelope: true,
          });

          if (!message) continue;

          if (message.source) {
            const fromAddr =
              message.envelope?.from?.[0]?.address || sender;
            emails.push({
              uid: typeof uid === "number" ? uid : parseInt(String(uid)),
              from: fromAddr,
              subject: message.envelope?.subject || "",
              raw: message.source,
            });
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    console.error(
      `IMAP error for ${account.label} (${account.user}):`,
      error
    );
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }

  return emails;
}

async function markEmailAsRead(
  account: EmailAccount,
  uid: number
): Promise<void> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: account.user,
      pass: account.password,
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageFlagsAdd(String(uid), ["\\Seen"]);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    console.error(`Failed to mark email ${uid} as read:`, error);
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

export async function scanAllAccounts(): Promise<FetchedEmail[]> {
  const accounts = getEmailAccounts();
  if (accounts.length === 0) {
    console.log("No email accounts configured for payment scanning");
    return [];
  }

  const allEmails: FetchedEmail[] = [];
  for (const account of accounts) {
    console.log(`Scanning ${account.label}...`);
    const emails = await fetchUnreadPaymentEmails(account);
    console.log(`  Found ${emails.length} unread payment emails`);
    allEmails.push(...emails);
  }

  return allEmails;
}

export async function markProcessed(
  accountEmail: string,
  uid: number
): Promise<void> {
  const accounts = getEmailAccounts();
  const account = accounts.find((a) => a.user === accountEmail);
  if (account) {
    await markEmailAsRead(account, uid);
  }
}

export { getEmailAccounts };
