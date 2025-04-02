import React, { useState, useEffect } from "react";
import { api } from "../services/api.service.ts";
import { AccountDetails } from "./AccountDetails.tsx";
import { EmailAccount } from "../types/account.types.ts";

interface AccountManagerProps {
  tenantId: string;
  userId1: string;
  userId2: string;
}

export const AccountManager: React.FC<AccountManagerProps> = ({
  tenantId,
  userId1,
  userId2,
}) => {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await api.getAccounts(tenantId);
      setAccounts(response);
      setError(null);
    } catch (err) {
      setError("Failed to fetch accounts");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [tenantId]);

  const handleConnectAccount = (userId: string, provider: string) => {
    // Construct URL for OAuth flow
    const redirectUri = window.location.origin;
    api.getAuthorizationUrl(provider, tenantId, userId, redirectUri);
  };

  const handleUpdateStatus = async (accountId: string, status: string) => {
    try {
      await api.updateAccount(accountId, { status });
      fetchAccounts();
    } catch (err) {
      setError("Failed to update account status");
      console.error(err);
    }
  };

  // Check for OAuth callback success/error
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get("success");
    const error = urlParams.get("error");

    if (success === "true") {
      const provider = urlParams.get("provider");
      const email = urlParams.get("email");
      alert(`Successfully connected ${provider} account: ${email}`);

      // Remove query params from URL
      window.history.replaceState({}, document.title, window.location.pathname);

      // Refresh accounts
      fetchAccounts();
    } else if (error) {
      setError(`OAuth error: ${error}`);

      // Remove query params from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  if (loading) return <div>Loading accounts...</div>;

  return (
    <div className="bg-white shadow rounded-lg p-4">
      {error && (
        <div className="bg-red-100 text-red-700 p-2 rounded mb-4">{error}</div>
      )}

      <div className="mb-6">
        <h3 className="font-medium mb-2">User 1 (Gmail)</h3>
        {accounts.find((a) => a.userId === userId1) ? (
          <AccountDetails
            account={accounts.find((a) => a.userId === userId1)!}
            onUpdateStatus={handleUpdateStatus}
          />
        ) : (
          <button
            onClick={() => handleConnectAccount(userId1, "gmail")}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Connect Gmail Account
          </button>
        )}
      </div>

      <div>
        <h3 className="font-medium mb-2">User 2 (Outlook)</h3>
        {accounts.find((a) => a.userId === userId2) ? (
          <AccountDetails
            account={accounts.find((a) => a.userId === userId2)!}
            onUpdateStatus={handleUpdateStatus}
          />
        ) : (
          <button
            onClick={() => handleConnectAccount(userId2, "outlook")}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Connect Outlook Account
          </button>
        )}
      </div>
    </div>
  );
};
