import { Resource } from '@medplum/fhirtypes';
import { generateId } from '../crypto';
import { TypedEventTarget } from '../eventtarget';
import { OperationOutcomeError, validationError } from '../outcomes';

// We currently try to satisfy both STU2 and STU3. Where STU3 removes a resource / key from STU2, we leave it in as a valid key but don't require it.

export const FHIRCAST_EVENT_NAMES = {
  'patient-open': 'patient-open',
  'patient-close': 'patient-close',
  'imagingstudy-open': 'imagingstudy-open',
  'imagingstudy-close': 'imagingstudy-close',
  'encounter-open': 'encounter-open',
  'encounter-close': 'encounter-close',
  'diagnosticreport-open': 'diagnosticreport-open',
  'diagnosticreport-close': 'diagnosticreport-close',
  syncerror: 'syncerror',
} as const;

export const FHIRCAST_RESOURCE_TYPES = [
  'Patient',
  'Encounter',
  'ImagingStudy',
  'DiagnosticReport',
  'OperationOutcome',
] as const;

export type FhircastEventName = keyof typeof FHIRCAST_EVENT_NAMES;
export type FhircastResourceType = (typeof FHIRCAST_RESOURCE_TYPES)[number];

export type FhircastEventContextDetails = {
  resourceType: FhircastResourceType;
  optional?: boolean; // NOTE: optional here is only referring to the schema, the spec often mentions that these are required if available as references for a given anchor resource
  manyAllowed?: boolean;
};

// Key value pairs of { [FhircastEventName]: [required_resource1, required_resource2] }
export const FHIRCAST_EVENT_RESOURCES = {
  'patient-open': {
    patient: { resourceType: 'Patient' },
    /* STU2 only! `encounter` key removed in STU3 */
    encounter: { resourceType: 'Encounter', optional: true },
  },
  'patient-close': {
    patient: { resourceType: 'Patient' },
    /* STU2 only! `encounter` key removed in STU3 */
    encounter: { resourceType: 'Encounter', optional: true },
  },
  'imagingstudy-open': {
    study: { resourceType: 'ImagingStudy' },
    encounter: { resourceType: 'Encounter', optional: true },
    patient: { resourceType: 'Patient', optional: true },
  },
  'imagingstudy-close': {
    study: { resourceType: 'ImagingStudy' },
    encounter: { resourceType: 'Encounter', optional: true },
    patient: { resourceType: 'Patient', optional: true },
  },
  'encounter-open': {
    encounter: { resourceType: 'Encounter' },
    patient: { resourceType: 'Patient' },
  },
  'encounter-close': {
    encounter: { resourceType: 'Encounter' },
    patient: { resourceType: 'Patient' },
  },
  'diagnosticreport-open': {
    report: { resourceType: 'DiagnosticReport' },
    encounter: { resourceType: 'Encounter', optional: true },
    study: { resourceType: 'ImagingStudy', optional: true, manyAllowed: true },
    patient: { resourceType: 'Patient' },
  },
  'diagnosticreport-close': {
    report: { resourceType: 'DiagnosticReport' },
    encounter: { resourceType: 'Encounter', optional: true },
    study: { resourceType: 'ImagingStudy', optional: true, manyAllowed: true },
    patient: { resourceType: 'Patient' },
  },
  syncerror: {
    operationoutcome: { resourceType: 'OperationOutcome' },
  },
} as const satisfies Record<FhircastEventName, Record<string, FhircastEventContextDetails>>;

/**
 * Checks if a `ResourceType` can be used in a `FHIRcast` context.
 *
 * @param resourceType - A `ResourceType` to test.
 * @returns `true` if this is a resource type associated with `FHIRcast` contexts, otherwise returns `false`.
 */
export function isFhircastResourceType(resourceType: FhircastResourceType): boolean {
  return FHIRCAST_RESOURCE_TYPES.includes(resourceType);
}

/**
 * A `FHIRcast` subscription request.
 *
 * Can be passed to `MedplumClient.fhircastConnect` or `MedplumClient.fhircastUnsubscribe` to either open a `FHIRcast` connection, or unsubscribe from the subscription.
 */
export type SubscriptionRequest = {
  channelType: 'websocket';
  mode: 'subscribe' | 'unsubscribe';
  events: FhircastEventName[];
  topic: string;
  endpoint: string;
};

export type PendingSubscriptionRequest = Omit<SubscriptionRequest, 'endpoint'>;

export const FHIRCAST_CONTEXT_KEY_LOOKUP = {
  study: 'ImagingStudy',
  patient: 'Patient',
  encounter: 'Encounter',
  report: 'DiagnosticReport',
  operationoutcome: 'OperationOutcome',
} as const;

export const FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP = {
  ImagingStudy: 'study',
  Patient: 'patient',
  Encounter: 'encounter',
  DiagnosticReport: 'report',
  OperationOutcome: 'operationoutcome',
} as const;

export type FhircastEventContextMap<EventName extends FhircastEventName = FhircastEventName> =
  (typeof FHIRCAST_EVENT_RESOURCES)[EventName];
export type FhircastEventContextKey<EventName extends FhircastEventName = FhircastEventName> =
  keyof FhircastEventContextMap<EventName>;

export type FhircastEventResourceType<
  EventName extends FhircastEventName = FhircastEventName,
  K extends FhircastEventContextKey<EventName> = FhircastEventContextKey<EventName>,
> = FhircastEventContextMap<EventName>[K] extends infer Ev extends FhircastEventContextDetails
  ? Ev['resourceType']
  : never;

export type FhircastEventResource<
  EventName extends FhircastEventName = FhircastEventName,
  K extends FhircastEventContextKey<EventName> = FhircastEventContextKey<EventName>,
> = FhircastEventContextMap<EventName>[K] extends infer _Ev extends FhircastEventContextDetails
  ? Resource & { resourceType: FhircastEventResourceType<EventName, K>; id: string }
  : never;

export type FhircastEventContext<
  EventName extends FhircastEventName = FhircastEventName,
  K extends FhircastEventContextKey<EventName> = FhircastEventContextKey<EventName>,
> = FhircastEventContextMap<EventName>[K] extends infer _Ev extends FhircastEventContextDetails
  ? {
      key: K;
      resource: FhircastEventResource<EventName, K>;
    }
  : never;

export type FhircastEventPayload<EventName extends FhircastEventName = FhircastEventName> = {
  'hub.topic': string;
  'hub.event': EventName;
  context: FhircastEventContext<EventName>[];
  'context.versionId'?: string;
};

export type FhircastMessagePayload<EventName extends FhircastEventName = FhircastEventName> = {
  timestamp: string;
  id: string;
  event: FhircastEventPayload<EventName>;
};

export function isCompletedSubscriptionRequest(
  subscriptionRequest: SubscriptionRequest | PendingSubscriptionRequest
): subscriptionRequest is SubscriptionRequest {
  return !!(subscriptionRequest as SubscriptionRequest).endpoint;
}

/**
 * Creates a serialized url-encoded payload for a `FHIRcast` subscription from a `SubscriptionRequest` object that can be directly used in an HTTP request to the Hub.
 *
 * @param subscriptionRequest - An object representing a subscription request.
 * @returns A serialized subscription in url-encoded form.
 */
export function serializeFhircastSubscriptionRequest(
  subscriptionRequest: SubscriptionRequest | PendingSubscriptionRequest
): string {
  if (!validateFhircastSubscriptionRequest(subscriptionRequest)) {
    throw new OperationOutcomeError(
      validationError('subscriptionRequest must be an object conforming to SubscriptionRequest type.')
    );
  }

  const { channelType, mode, topic, events } = subscriptionRequest;

  const formattedSubRequest = {
    'hub.channel.type': channelType,
    'hub.mode': mode,
    'hub.topic': topic,
    'hub.events': events.join(','),
  } as Record<string, string>;

  if (isCompletedSubscriptionRequest(subscriptionRequest)) {
    formattedSubRequest.endpoint = subscriptionRequest.endpoint;
  }
  return new URLSearchParams(formattedSubRequest).toString();
}

/**
 * Validates that a `SubscriptionRequest`.
 *
 * @param subscriptionRequest - The `SubscriptionRequest` to validate.
 * @returns A `boolean` indicating whether or not the `SubscriptionRequest` is valid.
 */
export function validateFhircastSubscriptionRequest(
  subscriptionRequest: SubscriptionRequest | PendingSubscriptionRequest
): boolean {
  if (typeof subscriptionRequest !== 'object') {
    return false;
  }
  const { channelType, mode, topic, events } = subscriptionRequest;
  if (!(channelType && mode && topic && events)) {
    return false;
  }
  if (typeof topic !== 'string') {
    return false;
  }
  if (typeof events !== 'object' || !Array.isArray(events) || events.length < 1) {
    return false;
  }
  if (channelType !== 'websocket') {
    return false;
  }
  if (mode !== 'subscribe' && mode !== 'unsubscribe') {
    return false;
  }
  for (const event of events) {
    if (!FHIRCAST_EVENT_NAMES[event]) {
      return false;
    }
  }
  if (
    isCompletedSubscriptionRequest(subscriptionRequest) &&
    !(typeof subscriptionRequest.endpoint === 'string' && subscriptionRequest.endpoint.startsWith('ws'))
  ) {
    return false;
  }
  return true;
}

/**
 * Throws if the context is invalid. Intended as a helper for `validateFhircastContexts` only.
 *
 * @param event - The `FHIRcast` event name associated with the provided contexts.
 * @param context - The `FHIRcast` event contexts to validate.
 * @param i - The index of the current context in the context list.
 * @param keySchema - Schema for given key for FHIRcast event.
 * @param keysSeen - Set of keys seen so far. Used to prevent duplicate keys.
 */
function validateFhircastContext<EventName extends FhircastEventName>(
  event: EventName,
  context: FhircastEventContext<EventName>,
  i: number,
  keySchema: FhircastEventContextDetails,
  keysSeen: Map<FhircastEventContextKey<EventName>, number>
): void {
  if (!(context.key && typeof context.key === 'string')) {
    throw new OperationOutcomeError(validationError(`context[${i}] is invalid. Context must contain a key.`));
  }
  keysSeen.set(context.key, (keysSeen.get(context.key) ?? 0) + 1);
  if (typeof context.resource !== 'object') {
    throw new OperationOutcomeError(
      validationError(
        `context[${i}] is invalid. Context must contain a single valid FHIR resource! Resource is not an object.`
      )
    );
  }
  if (!(context.resource.id && typeof context.resource.id === 'string')) {
    throw new OperationOutcomeError(
      validationError(`context[${i}] is invalid. Resource must contain a valid string ID.`)
    );
  }
  if (!context.resource.resourceType) {
    throw new OperationOutcomeError(
      validationError(`context[${i}] is invalid. Resource must contain a resource type. No resource type found.`)
    );
  }
  const resourceType = context.resource.resourceType;
  if (!isFhircastResourceType(resourceType as FhircastResourceType)) {
    throw new OperationOutcomeError(
      validationError(
        `context[${i}] is invalid. Resource must contain a valid FHIRcast resource type. Resource type is not a known resource type.`
      )
    );
  }
  // Make sure that resource is a valid type for this event
  const expectedResourceType = keySchema.resourceType;
  if (expectedResourceType && resourceType !== expectedResourceType) {
    throw new OperationOutcomeError(
      validationError(
        `context[${i}] is invalid. context[${i}] for the '${event}' event should contain resource of type ${expectedResourceType}.`
      )
    );
  }
  const expectedKey = FHIRCAST_CONTEXT_KEY_REVERSE_LOOKUP[resourceType as FhircastResourceType];
  if (expectedKey !== context.key) {
    throw new OperationOutcomeError(
      validationError(`context[${i}] is invalid. Context key for type ${resourceType} must be ${expectedKey}.`)
    );
  }
}

/**
 * Throws if any context in the given array of contexts is invalid.
 *
 * @param event - The `FHIRcast` event name associated with the provided contexts.
 * @param contexts - The `FHIRcast` event contexts to validate.
 */
function validateFhircastContexts<EventName extends FhircastEventName>(
  event: EventName,
  contexts: FhircastEventContext<EventName>[]
): void {
  const keysSeen = new Map<FhircastEventContextKey, number>();
  const eventSchema = FHIRCAST_EVENT_RESOURCES[event] as Record<FhircastEventContextKey, FhircastEventContextDetails>;
  for (let i = 0; i < contexts.length; i++) {
    const key = contexts[i].key as FhircastEventContextKey;
    if (!eventSchema[key]) {
      throw new OperationOutcomeError(
        validationError(`Key '${key}' not found for event '${event}'. Make sure to add only valid keys.`)
      );
    }
    validateFhircastContext(event, contexts[i], i, eventSchema[key], keysSeen);
  }
  // Iterate each key, if conditions for keys are not met as confirmed by `keysSeen` map, throw an error
  for (const [key, details] of Object.entries(eventSchema) as [
    FhircastEventContextKey,
    FhircastEventContextDetails,
  ][]) {
    // If not optional and not keysSeen.has(key), throw
    if (!(details.optional || keysSeen.has(key))) {
      throw new OperationOutcomeError(
        validationError(`Missing required key '${key}' on context for '${event}' event.`)
      );
    }
    // If not multiple allowed and keySeen.get(key) > 1, throw
    if (!details.manyAllowed && (keysSeen.get(key) || 0) > 1) {
      throw new OperationOutcomeError(
        validationError(
          `${keysSeen.get(
            key
          )} context entries with key '${key}' found for the '${event}' event when schema only allows for 1.`
        )
      );
    }
  }
}

/**
 * Creates a serializable JSON payload for the `FHIRcast` protocol
 *
 * @param topic - The topic that this message will be published on. Usually a UUID.
 * @param event - The event name, ie. "patient-open" or "patient-close".
 * @param context - The updated context, containing new versions of resources related to this event.
 * @returns A serializable `FhircastMessagePayload`.
 */
export function createFhircastMessagePayload<EventName extends FhircastEventName>(
  topic: string,
  event: EventName,
  context: FhircastEventContext<EventName> | FhircastEventContext<EventName>[]
): FhircastMessagePayload<EventName> {
  if (!(topic && typeof topic === 'string')) {
    throw new OperationOutcomeError(validationError('Must provide a topic.'));
  }
  if (!FHIRCAST_EVENT_NAMES[event]) {
    throw new OperationOutcomeError(
      validationError(
        `Must provide a valid FHIRcast event name. Supported events: ${Object.keys(FHIRCAST_EVENT_NAMES).join(', ')}`
      )
    );
  }
  if (typeof context !== 'object') {
    throw new OperationOutcomeError(validationError('context must be a context object or array of context objects.'));
  }

  const normalizedContexts = Array.isArray(context) ? context : [context];
  // This will throw if any context in the array is invalid
  validateFhircastContexts(event, normalizedContexts);
  return {
    timestamp: new Date().toISOString(),
    id: generateId(),
    event: {
      'hub.topic': topic,
      'hub.event': event,
      context: normalizedContexts,
    },
  };
}

export type FhircastConnectEvent = { type: 'connect' };
export type FhircastMessageEvent = { type: 'message'; payload: FhircastMessagePayload };
export type FhircastDisconnectEvent = { type: 'disconnect' };

export type FhircastSubscriptionEventMap = {
  connect: FhircastConnectEvent;
  message: FhircastMessageEvent;
  disconnect: FhircastDisconnectEvent;
};

/**
 * A class representing a `FHIRcast` connection.
 *
 * `FhircastConnection` extends `EventTarget` and emits 3 lifecycle events:
 * 1. `connect` - An event to signal when a WebSocket connection has been opened. Fired as soon as a WebSocket emits `open`.
 * 2. `message` - Contains a `payload` field containing a `FHIRcast` message payload exactly as it comes in over WebSockets.
 * 3. `disconnect` - An event to signal when a WebSocket connection has been closed. Fired as soon as a WebSocket emits `close`.
 *
 * To close the connection, call `connection.disconnect()` and listen to the `disconnect` event to know when the connection has been disconnected.
 */
export class FhircastConnection extends TypedEventTarget<FhircastSubscriptionEventMap> {
  subRequest: SubscriptionRequest;
  private websocket: WebSocket;

  /**
   * Creates a new `FhircastConnection`.
   * @param subRequest - The subscription request to initialize the connection from.
   */
  constructor(subRequest: SubscriptionRequest) {
    super();
    this.subRequest = subRequest;
    if (!subRequest.endpoint) {
      throw new OperationOutcomeError(validationError('Subscription request should contain an endpoint.'));
    }
    if (!validateFhircastSubscriptionRequest(subRequest)) {
      throw new OperationOutcomeError(validationError('Subscription request failed validation.'));
    }
    const websocket = new WebSocket(subRequest.endpoint);
    websocket.addEventListener('open', () => {
      this.dispatchEvent({ type: 'connect' });

      websocket.addEventListener('message', (event: MessageEvent) => {
        const message = JSON.parse(event.data) as Record<string, string | object>;

        // This is a check for `subscription request confirmations`, we just discard these for now
        if (message['hub.topic']) {
          return;
        }

        const fhircastMessage = message as unknown as FhircastMessagePayload;
        this.dispatchEvent({ type: 'message', payload: fhircastMessage });

        websocket.send(
          JSON.stringify({
            id: message?.id,
            timestamp: new Date().toISOString(),
          })
        );
      });

      websocket.addEventListener('close', () => {
        this.dispatchEvent({ type: 'disconnect' });
      });
    });
    this.websocket = websocket;
  }

  disconnect(): void {
    this.websocket.close();
  }
}
