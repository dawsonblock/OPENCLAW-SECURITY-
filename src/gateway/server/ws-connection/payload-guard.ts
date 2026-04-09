import {
  type IngressGuardOptions,
  type IngressGuardResult,
  guardInboundJsonText,
  guardInboundPayload as guardInboundPayloadSecurity,
  ingressGuardDefaults,
} from "../../../security/ingress-guard.js";

export type PayloadGuardOptions = IngressGuardOptions;
export type PayloadGuardResult = IngressGuardResult;

export const payloadGuardDefaults = ingressGuardDefaults;

export const guardInboundPayload = guardInboundPayloadSecurity;
export { guardInboundJsonText };
