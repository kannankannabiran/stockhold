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
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showInactiveOnly, setShowInactiveOnly] = React.useState(false);

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
    await api('url-access', { mobile, url, allow });
    setRefresh((r) => r + 1);
  };

  const setReqUrl = async (mobile, requestId, allow) => {
    await api('url-request', { mobile, requestId, allow });
    setRefresh((r) => r + 1);
  };

  const URL_LIST = [
    '/chart',
    '/longterm',
    '/stocklist',
    '/backtest',
    '/options',
    '/trendingoi',
    '/openhighnifty',
    '/herozero',
    '/individual',
    '/purchase-order'
  ];

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.mobile.includes(searchTerm.trim()) ||
      m.name?.toLowerCase().includes(searchTerm.trim().toLowerCase());
    const matchesInactive = !showInactiveOnly || !m.active;
    return matchesSearch && matchesInactive;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between bg-white p-4 rounded-lg shadow">
        <input
          type="text"
          placeholder="Search by mobile or name"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border px-4 py-2 rounded-lg w-full sm:w-64 focus:ring focus:ring-blue-200"
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showInactiveOnly}
            onChange={(e) => setShowInactiveOnly(e.target.checked)}
          />
          Show inactive only
        </label>
      </div>

      {filteredMembers.map((m) => (
        <div
          key={m.mobile}
          className="p-6 border rounded-xl bg-white shadow-lg hover:shadow-2xl transition"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b pb-4 mb-4 gap-4">
            <div>
              <div className="font-bold text-lg sm:text-xl">{m.name}</div>
              <div className="text-gray-500 text-sm">{m.mobile}</div>
              <div className="text-xs mt-2">
                <span
                  className={`px-3 py-1 rounded-full text-white text-sm ${
                    m.active ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                >
                  {m.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-xs sm:text-sm mt-2 text-gray-600 break-words">
                <span className="font-medium">URL Access:</span>{' '}
                {m.urlAccess?.length ? m.urlAccess.join(', ') : '(none)'}
              </div>
            </div>
            <div>
              <button
                onClick={() => toggleActive(m.mobile, !m.active)}
                className={`px-5 py-2 rounded-lg text-white text-sm sm:text-base ${
                  m.active
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {m.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>

          {/* URL Access Buttons */}
          <h3 className="font-semibold text-base mb-2">URL Access</h3>
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
            {URL_LIST.map((url) => {
              const hasAccess = m.urlAccess?.includes(url);
              return (
                <div
                  key={url}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border ${
                    hasAccess
                      ? 'bg-green-50 border-green-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <span className="text-sm sm:text-base font-medium text-center truncate w-full">
                    {url}
                  </span>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setUrl(m.mobile, url, true)}
                      disabled={hasAccess}
                      className={`px-3 py-1 text-sm rounded-lg text-white ${
                        hasAccess
                          ? 'bg-gray-300 cursor-not-allowed'
                          : 'bg-blue-500 hover:bg-blue-600'
                      }`}
                    >
                      Grant
                    </button>
                    <button
                      onClick={() => setUrl(m.mobile, url, false)}
                      disabled={!hasAccess}
                      className={`px-3 py-1 text-sm rounded-lg text-white ${
                        !hasAccess
                          ? 'bg-gray-300 cursor-not-allowed'
                          : 'bg-red-500 hover:bg-red-600'
                      }`}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* URL Requests Section */}
          {m.urlRequests?.length > 0 && (
            <>
              <h3 className="font-semibold text-base mb-2">URL Requests</h3>
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-4">
                {m.urlRequests.map((req) => {
                  const hasAccess = m.urlRequestsGranted?.includes(req.id);
                  return (
                    <div
                      key={req.id}
                      className={`p-4 rounded-xl border ${
                        hasAccess
                          ? 'bg-green-50 border-green-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="font-medium">{req.title}</div>
                      <div className="text-xs text-gray-500 mb-1">
                        ₹{req.price}
                      </div>
                      <div className="text-xs text-blue-600 break-all">
                        {req.downloadUrl}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setReqUrl(m.mobile, req.id, true)}
                          disabled={hasAccess}
                          className={`px-3 py-1 text-sm rounded-lg text-white ${
                            hasAccess
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-blue-500 hover:bg-blue-600'
                          }`}
                        >
                          Grant
                        </button>
                        <button
                          onClick={() => setReqUrl(m.mobile, req.id, false)}
                          disabled={!hasAccess}
                          className={`px-3 py-1 text-sm rounded-lg text-white ${
                            !hasAccess
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-red-500 hover:bg-red-600'
                          }`}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
