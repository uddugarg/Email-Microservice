import React from "react";
import { AccountManager } from "./components/AccountManager.tsx";
import { EmailSender } from "./components/EmailSender.tsx";
import { EmailLogs } from "./components/EmailLogs.tsx";
import "./App.css";

const App: React.FC = () => {
  // For demo purposes, hardcoding tenant and user IDs
  const tenantId = "demo-tenant";
  const userId1 = "user-1"; // Gmail user
  const userId2 = "user-2"; // Outlook user

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Email Microservice Demo</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Account Management</h2>
          <AccountManager
            tenantId={tenantId}
            userId1={userId1}
            userId2={userId2}
          />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Send Email</h2>
          <EmailSender
            tenantId={tenantId}
            userId1={userId1}
            userId2={userId2}
          />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Email Logs</h2>
        <EmailLogs tenantId={tenantId} userId1={userId1} userId2={userId2} />
      </div>
    </div>
  );
};

export default App;
