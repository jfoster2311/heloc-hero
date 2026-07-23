// supabase/functions/_shared/plaid.ts
// Deno-compatible Plaid API client — mirrors PlaidService from heloc-hero-back

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID") ?? "";
const PLAID_SECRET = Deno.env.get("PLAID_SECRET") ?? "";
export const PLAID_ENV = Deno.env.get("PLAID_ENV") ?? "sandbox";

const PLAID_BASE_URLS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export class PlaidClient {
  public env: string;
  private baseUrl: string;

  constructor() {
    this.env = PLAID_ENV;
    this.baseUrl = PLAID_BASE_URLS[this.env] ?? PLAID_BASE_URLS.sandbox;
    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      throw new Error("PLAID_CLIENT_ID and PLAID_SECRET env vars are required");
    }
  }

  private async post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        ...body,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error_message ?? data.display_message ?? `Plaid API error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async createLinkToken(userId: string, products = ["transactions", "liabilities"]) {
    return this.post("/link/token/create", {
      user: { client_user_id: userId },
      client_name: "HELOC Hero",
      products,
      country_codes: ["US"],
      language: "en",
      webhook:
        Deno.env.get("PLAID_WEBHOOK_URL") ??
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/plaid-webhook`,
    });
  }

  async exchangePublicToken(
    publicToken: string,
  ): Promise<{ success: boolean; access_token: string; item_id: string }> {
    const data = await this.post("/item/public_token/exchange", {
      public_token: publicToken,
    });
    return { success: true, access_token: data.access_token, item_id: data.item_id };
  }

  async getItem(accessToken: string) {
    return this.post("/item/get", { access_token: accessToken });
  }

  /** Revokes an access token and stops billing for the item. Irreversible. */
  async removeItem(accessToken: string) {
    return this.post("/item/remove", { access_token: accessToken });
  }

  async getInstitution(institutionId: string) {
    return this.post("/institutions/get_by_id", {
      institution_id: institutionId,
      country_codes: ["US"],
    });
  }

  async getAccounts(accessToken: string) {
    return this.post("/accounts/get", { access_token: accessToken });
  }

  async getAccountBalances(accessToken: string, accountIds?: string[]) {
    const body: Record<string, unknown> = { access_token: accessToken };
    if (accountIds?.length) body.options = { account_ids: accountIds };
    return this.post("/accounts/balance/get", body);
  }

  /**
   * Servicer-reported loan terms: rate, escrow, YTD interest, next payment,
   * origination, prepayment penalty.
   *
   * Covers credit(credit card, paypal) and loan(student, mortgage) ONLY — a
   * HELOC is in neither bucket, so this never returns HELOC terms for any
   * institution. Not every mortgage servicer participates either, which is why
   * the caller must treat a failure here as "no data", never as an error.
   */
  async getLiabilities(accessToken: string, accountIds?: string[]) {
    const body: Record<string, unknown> = { access_token: accessToken };
    if (accountIds?.length) body.options = { account_ids: accountIds };
    return this.post("/liabilities/get", body);
  }

  async syncTransactions(accessToken: string) {
    return this.post("/transactions/sync", { access_token: accessToken });
  }

  async createSandboxPublicToken(
    institutionId: string,
    initialProducts: string[],
    options: Record<string, unknown> = {},
  ) {
    if (this.env !== "sandbox") throw new Error("Sandbox only");
    return this.post("/sandbox/public_token/create", {
      institution_id: institutionId,
      initial_products: initialProducts,
      options,
    });
  }

  async sandboxFireSyncUpdateWebhook(accessToken: string) {
    if (this.env !== "sandbox") throw new Error("Sandbox only");
    return this.post("/sandbox/item/fire_webhook", {
      access_token: accessToken,
      webhook_code: "SYNC_UPDATES_AVAILABLE",
    });
  }
}
