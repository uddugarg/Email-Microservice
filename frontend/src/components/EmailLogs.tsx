import React, { useState, useEffect } from "react";
import { api } from "../services/api.service.ts";
import { EmailLog } from "../types/email.types.ts";

interface EmailLogsProps {
  tenantId: string;
  userId1: string;
  userId2: string;
}

export const EmailLogs: React.FC<EmailLogsProps> = ({
  tenantId,
  userId1,
  userId2,
}) => {
  const [selectedUser, setSelectedUser] = useState<string>(userId1);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await api.getEmailLogs(tenantId, selectedUser, page, 10);

      setLogs(response.items);
      setTotalPages(Math.ceil(response.totalCount / response.limit));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [tenantId, selectedUser, page]);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      QUEUED: "bg-blue-100 text-blue-800",
      PROCESSING: "bg-purple-100 text-purple-800",
      SENT: "bg-green-100 text-green-800",
      FAILED: "bg-red-100 text-red-800",
      REJECTED: "bg-orange-100 text-orange-800",
      REQUEUED: "bg-yellow-100 text-yellow-800",
    };

    return (
      <span
        className={`px-2 py-1 rounded text-xs ${
          colors[status] || "bg-gray-100 text-gray-800"
        }`}
      >
        {status}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="mb-4 flex space-x-4">
        <button
          onClick={() => {
            setSelectedUser(userId1);
            setPage(1);
          }}
          className={`px-4 py-2 rounded ${
            selectedUser === userId1 ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          User 1
        </button>

        <button
          onClick={() => {
            setSelectedUser(userId2);
            setPage(1);
          }}
          className={`px-4 py-2 rounded ${
            selectedUser === userId2 ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
        >
          User 2
        </button>
      </div>

      {loading ? (
        <div className="text-center py-4">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          No email logs found
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.toEmail}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.subject}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {statusBadge(log.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded bg-gray-200 disabled:opacity-50"
              >
                Previous
              </button>

              <span>
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 rounded bg-gray-200 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
