import { GoogleAuth } from "google-auth-library";
import { loadEnv } from "../shared/env.js";

const ELECTRIC_HEADER_PREFIX = "electric-";

let auth: GoogleAuth | undefined;

function getAuth(): GoogleAuth {
  if (!auth) {
    auth = new GoogleAuth();
  }

  return auth;
}

interface RawElectricResponse {
  status: number;
  headers: Headers;
  data: string;
}

async function fetchWithIamToken(targetUrl: string, audience: string): Promise<RawElectricResponse> {
  const client = await getAuth().getIdTokenClient(audience);

  const response = await client.request<string>({
    url: targetUrl,
    responseType: "text",
    validateStatus: () => true,
  });

  return {
    status: response.status,
    headers: response.headers,
    data: response.data ?? "",
  };
}

async function fetchWithoutAuth(targetUrl: string): Promise<RawElectricResponse> {
  const response = await fetch(targetUrl);

  return {
    status: response.status,
    headers: response.headers,
    data: await response.text(),
  };
}

export interface ElectricShapeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export async function fetchElectricShape(search: string): Promise<ElectricShapeResponse> {
  const env = loadEnv();

  if (!env.ELECTRIC_SERVICE_URL) {
    throw new Error("ELECTRIC_SERVICE_URL is not configured");
  }

  const targetUrl = `${env.ELECTRIC_SERVICE_URL}/v1/shape${search}`;

  const response =
    env.ELECTRIC_AUTH_MODE === "none"
      ? await fetchWithoutAuth(targetUrl)
      : await fetchWithIamToken(targetUrl, env.ELECTRIC_SERVICE_URL);

  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith(ELECTRIC_HEADER_PREFIX) || key.toLowerCase() === "content-type") {
      headers[key] = value;
    }
  });

  return {
    status: response.status,
    headers,
    body: response.data,
  };
}
