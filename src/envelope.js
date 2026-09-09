// SPDX-FileCopyrightText: 2026 Sungmoon Park
// SPDX-License-Identifier: Apache-2.0
'use strict';
const { randomUUID } = require('node:crypto');
const { canonical, sha, payloadHash } = require('./canonical');
const contract = require('../contracts/integration-contract.json');
const keys = ['recordId','sourceOrg','targetOrg','recordType','businessIdType','businessId',
  'operation','payloadHash','payloadRef','payloadSizeBytes','payloadStorageType','schemaVersion','submittedAt'];
function recordId(e) {
  return sha([e.sourceOrg,e.recordType,e.businessIdType,e.businessId,e.payloadHash].join('|')).slice(0,24);
}
function validate(e) {
  if (!e || typeof e !== 'object' || Object.keys(e).sort().join() !== [...keys].sort().join())
    throw new Error('envelope fields');
  const s = Object.hasOwn(contract.sources, e.sourceOrg) && contract.sources[e.sourceOrg];
  if (!s || e.targetOrg !== contract.envelope.targetOrg ||
      e.recordType !== s.recordType || e.businessIdType !== s.businessIdType ||
      !s.operations.includes(e.operation)) throw new Error('scope');
  if (typeof e.businessId !== 'string' || !e.businessId.trim() ||
      e.businessId.length > contract.envelope.maxBusinessIdLength ||
      e.businessId.includes('|')) throw new Error('business identifier');
  if (typeof e.payloadHash !== 'string' || !new RegExp(contract.envelope.payloadHashPattern).test(e.payloadHash) ||
      typeof e.payloadRef !== 'string' || !new RegExp(contract.envelope.payloadRefPattern).test(e.payloadRef))
    throw new Error('payload reference/hash');
  if (!Number.isSafeInteger(e.payloadSizeBytes) || e.payloadSizeBytes < 1 ||
      e.payloadSizeBytes > contract.envelope.maxPayloadSizeBytes ||
      e.payloadStorageType !== contract.envelope.payloadStorageType ||
      e.schemaVersion !== contract.ledgerSchemaVersion) throw new Error('payload metadata');
  if (typeof e.submittedAt !== 'string' || !Number.isFinite(Date.parse(e.submittedAt)) ||
      new Date(e.submittedAt).toISOString() !== e.submittedAt) throw new Error('timestamp');
  if (e.recordId !== recordId(e)) throw new Error('record identifier');
  return e;
}
function adapt(sourceOrg, payload, { uuid = randomUUID(), now = new Date().toISOString() } = {}) {
  const s = Object.hasOwn(contract.sources, sourceOrg) && contract.sources[sourceOrg];
  if (!s || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('adapter input');
  const businessId = sourceOrg === 'Source A' ? payload.jobKey : payload.plan?.key;
  const operation = sourceOrg === 'Source A' ? payload.operation : payload.plan?.operation;
  const e = { sourceOrg, targetOrg: 'Target T', recordType: s.recordType,
    businessIdType: s.businessIdType, businessId, operation, payloadHash: payloadHash(payload),
    payloadRef: 'pg:artifact_payloads/' + uuid, payloadSizeBytes: Buffer.byteLength(canonical(payload)),
    payloadStorageType: 'POSTGRES', schemaVersion: contract.ledgerSchemaVersion, submittedAt: now };
  e.recordId = recordId(e);
  return validate(e);
}
module.exports = { contract, keys, recordId, validate, adapt };
