import React from "react";
import { EmailAccount } from "../types/account.types.ts";

interface AccountDetailsProps {
  account: EmailAccount;
  onUpdateStatus: (accountId: string, status: string) => void;
}

export const AccountDetails: React.FC<AccountDetailsProps> = ({
  account,
  onUpdateStatus,
}) => {
  const statusColor = {
    ACTIVE: "bg-green-100 text-green-800",
    INACTIVE: "bg-gray-100 text-gray-800",
    WARMING_UP: "bg-yellow-100 text-yellow-800",
  };

  return (
    <div className="border rounded p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium">{account.email}</span>
        <span
          className={`px-2 py-1 rounded text-xs ${statusColor[account.status]}`}
        >
          {account.status}
        </span>
      </div>

      <div className="text-sm text-gray-600 mb-2">
        Provider: {account.provider}
      </div>

      <div className="text-sm text-gray-600 mb-4">
        <div>Daily Limit: {account.quotaSettings.dailyLimit} emails</div>
        <div>Warmup Stage: {account.quotaSettings.currentStage} / 10</div>
        <div>Max Limit: {account.quotaSettings.maxLimit} emails</div>
      </div>

      <div className="flex space-x-2">
        {account.status !== "ACTIVE" && (
          <button
            onClick={() => onUpdateStatus(account.id, "ACTIVE")}
            className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
          >
            Activate
          </button>
        )}

        {account.status !== "INACTIVE" && (
          <button
            onClick={() => onUpdateStatus(account.id, "INACTIVE")}
            className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
          >
            Deactivate
          </button>
        )}

        {account.status === "ACTIVE" && (
          <button
            onClick={() => onUpdateStatus(account.id, "WARMING_UP")}
            className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
          >
            Reset Warmup
          </button>
        )}
      </div>
    </div>
  );
};
