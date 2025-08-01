'use client';
import React from 'react';

async function api(action, data) {
  const res = await fetch(`/api/auth?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export function AdminPanel() {
  const [members, setMembers] = React.useState([]);
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    fetch('/api/members')
      .then((r) => r.json())
      .then((d) => setMembers(d.members || []));
  }, [refresh]);

  const toggleActive = async (mobile, active) => {
    await api('toggle', { mobile, active });
    setRefresh((r) => r + 1);
  };
  const setUrl = async (mobile, url, allow) => {
    if (!url) return;
    await api('url-access', { mobile, url, allow });
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      {members.map((m) => (
        <div key={m.mobile} className="p-4 border rounded flex flex-col gap-2 bg-white shadow">
          <div className="flex justify-between">
            <div>
              <div className="font-semibold">{m.name}</div>
              <div className="text-sm">{m.mobile}</div>
              <div className="text-xs">Active: {m.active ? 'Yes' : 'No'}</div>
              <div className="text-xs">
                URL Access: {m.urlAccess?.join(', ') || '(none)'}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => toggleActive(m.mobile, !m.active)}
                className="px-3 py-1 border rounded"
              >
                {m.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              placeholder="URL"
              id={`url-${m.mobile}`}
              className="border p-2 rounded flex-1"
            />
            <button
              onClick={() => {
                const url = document.getElementById(`url-${m.mobile}`).value;
                setUrl(m.mobile, url, true);
              }}
              className="px-3 py-1 bg-blue-500 text-white rounded"
            >
              Grant URL
            </button>
            <button
              onClick={() => {
                const url = document.getElementById(`url-${m.mobile}`).value;
                setUrl(m.mobile, url, false);
              }}
              className="px-3 py-1 bg-red-500 text-white rounded"
            >
              Revoke URL
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
