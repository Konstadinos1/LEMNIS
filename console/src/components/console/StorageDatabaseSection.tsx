import { useState } from 'react';
import { AlertTriangle, Database, Eye, EyeOff, FolderPlus, Plus, Trash2, Upload } from 'lucide-react';
import {
  type Persona,
  type Protocol28State,
  opCreateBucket,
  opCreateTable,
  opDeleteObject,
  opDeleteRecord,
  opInsertRecord,
  opToggleBucketVisibility,
  opUploadObject,
} from '../../runtime/protocol28Store';

interface StorageSectionProps {
  state: Protocol28State;
  persona: Persona;
  onStateChange: (next: Protocol28State, notice: { tone: 'emerald' | 'danger'; text: string }) => void;
}

export function StorageSection({ state, persona, onStateChange }: StorageSectionProps) {
  const [bucketName, setBucketName] = useState('');
  const [selectedBucket, setSelectedBucket] = useState<string>('app-config');
  const [objKey, setObjKey] = useState('settings.json');
  const [objContent, setObjContent] = useState('{"region": "us-east", "replicas": 2}');

  const visibleBuckets = Object.values(state.buckets).filter(
    (b) => b.isPublic || b.owner === persona.principal || persona.isController,
  );
  const currentBucket = state.buckets[selectedBucket];

  function handleCreateBucket(e: React.FormEvent) {
    e.preventDefault();
    const res = opCreateBucket(state, persona, bucketName.trim());
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `storage.createBucket() -> #err("${res.error}")` });
      return;
    }
    setSelectedBucket(res.value.bucket.id);
    setBucketName('');
    onStateChange(res.value.state, { tone: 'emerald', text: `Created private bucket "${res.value.bucket.id}".` });
  }

  function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const res = opUploadObject(state, persona, selectedBucket, objKey.trim(), objContent, 'application/json');
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `storage.uploadObject() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value.state, {
      tone: 'emerald',
      text: `Uploaded "${res.value.object.key}" (${res.value.object.size} bytes) into "${selectedBucket}".`,
    });
  }

  function handleTogglePublic(bucketId: string, nextPublic: boolean) {
    const res = opToggleBucketVisibility(state, persona, bucketId, nextPublic);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `storage.setBucketVisibility() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value.state, {
      tone: 'emerald',
      text: `Bucket "${bucketId}" is now ${nextPublic ? 'Public Read' : 'Private'}.`,
    });
  }

  function handleDeleteObj(bucketId: string, key: string) {
    const res = opDeleteObject(state, persona, bucketId, key);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `storage.deleteObject() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value, { tone: 'emerald', text: `Deleted "${key}" from "${bucketId}" (counters decremented).` });
  }

  return (
    <div className="stack-lg">
      <div className="callout callout-amber">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Honest Cost Scope:</strong> ICP on-chain storage costs <code>~$5.35/GiB-yr (~$0.45/GB-mo)</code> vs AWS S3 Standard at <code>$0.023/GB-mo</code>.
          Use Protocol 28 <code>storage</code> strictly for small replicated configs/manifests (≤ 2 MiB/object). Bulk media uses IPFS/Storacha (Q2).
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="sheet sheet-pad stack-md">
          <h3 style={{ fontSize: 17 }}>Buckets (Nested Isolation)</h3>
          <form onSubmit={handleCreateBucket} className="row-wrap">
            <input
              type="text"
              className="input mono"
              style={{ flex: 1, fontSize: 13 }}
              placeholder="e.g. prod-configs (no '/')"
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm">
              <FolderPlus size={14} /> Create
            </button>
          </form>

          <div className="stack-sm">
            {visibleBuckets.map((b) => (
              <div
                key={b.id}
                className="recessed row-between"
                style={{
                  cursor: 'pointer',
                  borderColor: selectedBucket === b.id ? 'var(--accent)' : undefined,
                }}
                onClick={() => setSelectedBucket(b.id)}
              >
                <div>
                  <strong className="mono">{b.id}</strong>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    {b.objectCount} obj · {b.totalSize} B · {b.isPublic ? 'Public Read' : 'Private'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePublic(b.id, !b.isPublic);
                  }}
                >
                  {b.isPublic ? <Eye size={13} /> : <EyeOff size={13} />}
                  {b.isPublic ? 'Public' : 'Private'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="sheet sheet-pad stack-md">
          <h3 style={{ fontSize: 17 }}>Objects in <code className="mono">{selectedBucket}</code></h3>
          <form onSubmit={handleUpload} className="stack-sm">
            <input
              type="text"
              className="input mono"
              style={{ fontSize: 13 }}
              placeholder="Object key (rejects leading '/' or '..')"
              value={objKey}
              onChange={(e) => setObjKey(e.target.value)}
            />
            <textarea
              className="textarea textarea-code"
              rows={4}
              value={objContent}
              onChange={(e) => setObjContent(e.target.value)}
            />
            <button type="submit" className="btn btn-accent btn-sm" style={{ alignSelf: 'flex-start' }}>
              <Upload size={14} /> Upload Object
            </button>
          </form>

          {currentBucket && (currentBucket.isPublic || currentBucket.owner === persona.principal || persona.isController) ? (
            <div className="stack-sm">
              {Object.values(currentBucket.objects).map((obj) => (
                <div key={obj.key} className="recessed stack-sm" style={{ gap: 6 }}>
                  <div className="row-between">
                    <strong className="mono" style={{ fontSize: 13 }}>{obj.key}</strong>
                    <div className="row-wrap">
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{obj.size} B</span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteObj(selectedBucket, obj.key)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <pre className="code-block" style={{ padding: '8px 10px', fontSize: 11.5 }}>{obj.content}</pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="callout callout-danger">Not authorized to read this private bucket as {persona.principal}.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DatabaseSection({ state, persona, onStateChange }: StorageSectionProps) {
  const [tableName, setTableName] = useState('');
  const [selectedTable, setSelectedTable] = useState('feature_flags');
  const [fieldKey, setFieldKey] = useState('flag');
  const [fieldValue, setFieldValue] = useState('auto_scaling_v2');
  const [filterField, setFilterField] = useState('');
  const [filterVal, setFilterVal] = useState('');

  const myTables = Object.values(state.tables).filter(
    (t) => t.owner === persona.principal || persona.isController,
  );
  const currentTable = state.tables[selectedTable];
  const canReadTable = Boolean(currentTable && (currentTable.owner === persona.principal || persona.isController));

  const visibleRecords = canReadTable && currentTable
    ? Object.values(currentTable.records).filter((rec) => {
        if (!filterField.trim()) return true;
        return rec.data.some(([k, v]) => k === filterField.trim() && v === filterVal.trim());
      })
    : [];

  function handleCreateTable(e: React.FormEvent) {
    e.preventDefault();
    const res = opCreateTable(state, persona, tableName.trim());
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `database.createTable() -> #err("${res.error}")` });
      return;
    }
    setSelectedTable(res.value.table.name);
    setTableName('');
    onStateChange(res.value.state, { tone: 'emerald', text: `Created owner-isolated table "${res.value.table.name}".` });
  }

  function handleInsert(e: React.FormEvent) {
    e.preventDefault();
    const res = opInsertRecord(state, persona, selectedTable, [
      [fieldKey.trim(), fieldValue.trim()],
      ['env', 'production'],
    ]);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `database.insert() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value.state, { tone: 'emerald', text: `Inserted ${res.value.record.id} into "${selectedTable}".` });
  }

  function handleDelete(recordId: string) {
    const res = opDeleteRecord(state, persona, selectedTable, recordId);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `database.delete() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value, { tone: 'emerald', text: `Deleted ${recordId} from "${selectedTable}" (recordCount updated).` });
  }

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="sheet sheet-pad stack-md">
        <div className="row-wrap">
          <Database size={16} color="var(--accent)" />
          <h3 style={{ fontSize: 17 }}>Tables (Nested Per-Table Maps)</h3>
        </div>
        <form onSubmit={handleCreateTable} className="row-wrap">
          <input
            type="text"
            className="input mono"
            style={{ flex: 1, fontSize: 13 }}
            placeholder="e.g. tenant_settings"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            <Plus size={14} /> Create Table
          </button>
        </form>

        <div className="stack-sm">
          {myTables.map((t) => (
            <div
              key={t.name}
              className="recessed row-between"
              style={{ cursor: 'pointer', borderColor: selectedTable === t.name ? 'var(--accent)' : undefined }}
              onClick={() => setSelectedTable(t.name)}
            >
              <strong className="mono">{t.name}</strong>
              <span className="badge badge-neutral">{t.recordCount} records</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sheet sheet-pad stack-md">
        <h3 style={{ fontSize: 17 }}>Records in <code className="mono">{selectedTable}</code></h3>

        <form onSubmit={handleInsert} className="row-wrap">
          <input
            type="text"
            className="input mono"
            style={{ width: 120, fontSize: 12.5 }}
            placeholder="key"
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value)}
          />
          <input
            type="text"
            className="input mono"
            style={{ flex: 1, minWidth: 140, fontSize: 12.5 }}
            placeholder="value"
            value={fieldValue}
            onChange={(e) => setFieldValue(e.target.value)}
          />
          <button type="submit" className="btn btn-accent btn-sm">Insert</button>
        </form>

        <div className="row-wrap">
          <input
            type="text"
            className="input"
            style={{ width: 130, fontSize: 12.5 }}
            placeholder="queryByField key"
            value={filterField}
            onChange={(e) => setFilterField(e.target.value)}
          />
          <input
            type="text"
            className="input"
            style={{ flex: 1, fontSize: 12.5 }}
            placeholder="exact match value"
            value={filterVal}
            onChange={(e) => setFilterVal(e.target.value)}
          />
        </div>

        {!canReadTable ? (
          <div className="callout callout-danger">Not authorized to read table &ldquo;{selectedTable}&rdquo;.</div>
        ) : (
          <div className="stack-sm">
            {visibleRecords.map((rec) => (
              <div key={rec.id} className="recessed row-between">
                <div>
                  <strong className="mono" style={{ fontSize: 12.5 }}>{rec.id}</strong>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--ink-secondary)', marginTop: 3 }}>
                    {rec.data.map(([k, v]) => `${k}=${v}`).join(' · ')}
                  </div>
                </div>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(rec.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
