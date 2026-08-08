'use client';
import React from 'react';
import { FiChevronDown, FiChevronUp, FiTrash } from 'react-icons/fi';

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
  const [expanded, setExpanded] = React.useState({});

  React.useEffect(() => {
    fetch('/api/members')
      .then((r) => r.json())
      .then((d) => setMembers(d.members || []));
  }, [refresh]);

  const toggleActive = async (mobile, active) => {
    await api('toggle', { mobile, active });
    setRefresh((r) => r + 1);
  };

  const deleteMember = async (mobile) => {
    if (!confirm("Are you sure you want to delete this member?")) return;
    await api('delete', { mobile });
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
    '/chart','/longterm','/stocklist','/backtest','/options','/trendingoi',
    '/openhighnifty','/herozero','/individual','/purchase-order','/order','/trading'
  ];

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.mobile.includes(searchTerm.trim()) ||
      m.name?.toLowerCase().includes(searchTerm.trim().toLowerCase());
    const matchesInactive = !showInactiveOnly || !m.active;
    return matchesSearch && matchesInactive;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
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

      {/* Desktop Table */}
      <div className="hidden sm:block overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">SL No</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Mobile</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">URL Access</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((m, index) => {
              const isExpanded = expanded[m.mobile];
              return (
                <React.Fragment key={m.mobile}>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{index + 1}</td>
                    <td className="px-4 py-2 font-medium">{m.name}</td>
                    <td className="px-4 py-2">{m.mobile}</td>
                    <td className="px-4 py-2">
                      <span className={`px-3 py-1 rounded-full text-white ${
                        m.active ? 'bg-green-500' : 'bg-gray-400'
                      }`}>
                        {m.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {m.urlAccess?.length ? m.urlAccess.join(', ') : '(none)'}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2 flex justify-end">
                      <button
                        onClick={() => toggleActive(m.mobile, !m.active)}
                        className={`px-3 py-1 rounded-lg text-white ${
                          m.active ? 'bg-red-500 hover:bg-red-600'
                                   : 'bg-green-500 hover:bg-green-600'
                        }`}
                      >
                        {m.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev, [m.mobile]: !isExpanded,
                          }))
                        }
                        className="px-3 py-1 rounded-lg border text-gray-700 hover:bg-gray-100"
                      >
                        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                      </button>
                      <button
                        onClick={() => deleteMember(m.mobile)}
                        className="px-3 py-1 rounded-lg text-white bg-red-600 hover:bg-red-700 flex items-center"
                      >
                        <FiTrash />
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50 border-b">
                      <td colSpan={6} className="px-4 py-4">
                        {renderExpanded(m)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-4">
        {filteredMembers.map((m) => {
          const isExpanded = expanded[m.mobile];
          return (
            <div key={m.mobile} className="bg-white rounded-lg shadow p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-xs text-gray-500">{m.mobile}</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-white text-xs ${
                  m.active ? 'bg-green-500' : 'bg-gray-400'
                }`}>
                  {m.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                URLs: {m.urlAccess?.length ? m.urlAccess.join(', ') : '(none)'}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleActive(m.mobile, !m.active)}
                  className={`flex-1 px-3 py-1 rounded-lg text-white ${
                    m.active ? 'bg-red-500 hover:bg-red-600'
                             : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  {m.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev, [m.mobile]: !isExpanded,
                    }))
                  }
                  className="px-3 py-1 rounded-lg border text-gray-700 hover:bg-gray-100"
                >
                  {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                </button>
                <button
                  onClick={() => deleteMember(m.mobile)}
                  className="px-3 py-1 rounded-lg text-white bg-red-600 hover:bg-red-700 flex items-center"
                >
                  <FiTrash />
                </button>
              </div>
              {isExpanded && <div className="pt-3 border-t">{renderExpanded(m)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  function renderExpanded(m) {
    return (
      <>
        <h3 className="font-semibold text-base mb-2">URL Access</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {URL_LIST.map((url) => {
            const hasAccess = m.urlAccess?.includes(url);
            return (
              <div key={url}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border ${
                  hasAccess ? 'bg-green-50 border-green-300'
                            : 'bg-gray-50 border-gray-200'
                }`}
              >
                <span className="text-sm font-medium text-center truncate w-full">
                  {url}
                </span>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setUrl(m.mobile, url, true)}
                    disabled={hasAccess}
                    className={`px-3 py-1 text-sm rounded-lg text-white ${
                      hasAccess ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                  >
                    Grant
                  </button>
                  <button
                    onClick={() => setUrl(m.mobile, url, false)}
                    disabled={!hasAccess}
                    className={`px-3 py-1 text-sm rounded-lg text-white ${
                      !hasAccess ? 'bg-gray-300 cursor-not-allowed'
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
    );
  }
}
