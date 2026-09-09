// SPDX-FileCopyrightText: 2026 Sungmoon Park
// SPDX-License-Identifier: Apache-2.0
'use strict';
const { canonical } = require('./canonical');
const { adapt } = require('./envelope');
class SubmissionService {
  constructor(pool, writers) { this.pool = pool; this.writers = writers; }
  async initialize() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS artifact_payloads (
      id uuid PRIMARY KEY, record_id text UNIQUE NOT NULL, raw jsonb NOT NULL,
      canonical text NOT NULL, stored_hash text NOT NULL, envelope jsonb NOT NULL,
      tx_id text NOT NULL, status text NOT NULL CHECK(status IN ('RECEIVED','UNKNOWN','COMMITTED'))
    )`);
  }
  async submit(source, payload, fault = null) {
    const e = adapt(source, payload);
    const writer = this.writers[source];
    if (!writer) throw new Error('source writer absent');
    const existing = await this.pool.query('SELECT * FROM artifact_payloads WHERE record_id=$1', [e.recordId]);
    if (existing.rows.length) return { recordId: e.recordId, status: existing.rows[0].status, duplicate: true };
    const proposal = writer.contract.newProposal('RecordIntegrationResult', { arguments: [JSON.stringify(e)] });
    const tx = proposal.getTransactionId();
    await this.pool.query(`INSERT INTO artifact_payloads
      (id,record_id,raw,canonical,stored_hash,envelope,tx_id,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'RECEIVED')`,
      [e.payloadRef.split('/')[1],e.recordId,payload,canonical(payload),e.payloadHash,e,tx]);
    if (fault === 'not-submitted') {
      await this.pool.query("UPDATE artifact_payloads SET status='UNKNOWN' WHERE record_id=$1", [e.recordId]);
      return { recordId:e.recordId, status:'UNKNOWN', fault };
    }
    let committed;
    try {
      committed = await (await proposal.endorse()).submit();
      const status = await committed.getStatus();
      if (!status.successful) throw new Error('ledger transaction invalid: ' + status.code);
    } catch (error) {
      await this.pool.query("UPDATE artifact_payloads SET status='UNKNOWN' WHERE record_id=$1", [e.recordId]);
      return { recordId:e.recordId,status:'UNKNOWN',failure:error.message };
    }
    if (fault === 'commit-then-timeout' || fault === 'finalize-failure')
      return { recordId:e.recordId,status:'RECEIVED',fault };
    await this.pool.query("UPDATE artifact_payloads SET status='COMMITTED' WHERE record_id=$1", [e.recordId]);
    return { recordId:e.recordId,status:'COMMITTED',transactionId:tx };
  }
}
module.exports = { SubmissionService };
