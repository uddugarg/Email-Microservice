import React, { useState, useEffect } from "react";
import { api } from "../services/api.service.ts";
import { EmailAccount } from "../types/account.types.ts";

interface EmailSenderProps {
  tenantId: string;
  userId1: string;
  userId2: string;
}

export const EmailSender: React.FC<EmailSenderProps> = ({
  tenantId,
  userId1,
  userId2,
}) => {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [toAddress, setToAddress] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await api.getAccounts(tenantId);
        setAccounts(response);

        // Set default selected user if accounts exist
        if (response.length > 0) {
          setSelectedUser(response[0].userId);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchAccounts();
  }, [tenantId]);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser || !subject || !body) {
      setResult({
        success: false,
        message: "Please fill all required fields",
      });
      return;
    }

    try {
      setSending(true);
      setResult(null);

      const response = await api.sendEmail({
        tenantId,
        userId: selectedUser,
        toAddress: toAddress || undefined, // If empty, will use resolved address
        subject,
        body,
        metadata: {
          priority: "NORMAL",
        },
      });

      setResult({
        success: true,
        message: `Email queued successfully! Event ID: ${response.eventId}`,
      });

      // Clear form
      setToAddress("");
      setSubject("");
      setBody("");
    } catch (err) {
      setResult({
        success: false,
        message: "Failed to send email. Please try again.",
      });
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <form onSubmit={handleSendEmail}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">From User</label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full border rounded p-2"
            disabled={accounts.length === 0}
          >
            {accounts.length === 0 && (
              <option value="">No connected accounts</option>
            )}

            {accounts.map((account) => (
              <option key={account.id} value={account.userId}>
                {account.userId === userId1 ? "User 1" : "User 2"} (
                {account.email})
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            To Address (optional, will use user's email if blank)
          </label>
          <input
            type="email"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className="w-full border rounded p-2"
            placeholder="recipient@example.com"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border rounded p-2"
            placeholder="Email subject"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full border rounded p-2"
            rows={5}
            placeholder="Email body"
            required
          />
        </div>

        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 w-full"
          disabled={sending || accounts.length === 0}
        >
          {sending ? "Sending..." : "Send Email"}
        </button>
      </form>

      {result && (
        <div
          className={`mt-4 p-3 rounded ${
            result.success
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
};
