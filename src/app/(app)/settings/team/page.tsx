"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import type { UserRole, Vendor } from "@/lib/types";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
  deactivated_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  vendor_id: string | null;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  inviter?: { full_name: string };
}

const roleBadgeColor: Record<UserRole, string> = {
  super_admin: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  user: "bg-gray-100 text-gray-800",
  vendor: "bg-orange-100 text-orange-800",
};

const roleLabel: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
  vendor: "Vendor",
};

export default function TeamPage() {
  const { role: myRole } = useRole();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [deactivated, setDeactivated] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("user");
  const [inviteVendorId, setInviteVendorId] = useState<string>("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const supabase = createClient();

  async function loadData() {
    const [{ data: profileData }, { data: inviteData }, { data: vendorData }] =
      await Promise.all([
        supabase.from("profiles").select("id, full_name, email, role, created_at, deactivated_at").order("created_at"),
        supabase.from("invitations").select("*").is("accepted_at", null).order("created_at", { ascending: false }),
        supabase.from("vendors").select("id, name").order("name"),
      ]);

    const invites = (inviteData || []) as Invitation[];
    // Emails with pending (unaccepted) invitations — these users exist in auth but haven't accepted yet
    const pendingEmails = new Set(invites.map((i) => i.email.toLowerCase()));
    const allProfiles = (profileData || []) as TeamMember[];
    const active = allProfiles.filter((p) => !p.deactivated_at && !pendingEmails.has(p.email.toLowerCase()));
    const inactive = allProfiles.filter((p) => p.deactivated_at);
    setMembers(active);
    setDeactivated(inactive);
    setInvitations(invites);
    setVendors((vendorData || []) as Vendor[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setError(null);

    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        role: inviteRole,
        vendor_id: inviteRole === "vendor" ? inviteVendorId : undefined,
      }),
    });

    const data = await res.json();
    setInviteLoading(false);

    if (!res.ok) {
      showError(data.error || "Failed to send invite");
      return;
    }

    showSuccess(`Invitation sent to ${inviteEmail}`);
    setInviteEmail("");
    setInviteRole("user");
    setInviteVendorId("");
    loadData();
  }

  async function handleResend(invitationId: string) {
    setActionLoading(invitationId);
    const res = await fetch("/api/invite/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitation_id: invitationId }),
    });
    const data = await res.json();
    setActionLoading(null);

    if (!res.ok) {
      showError(data.error || "Failed to resend");
      return;
    }
    showSuccess("Invitation resent");
    loadData();
  }

  async function handleCancelInvite(invitationId: string) {
    setActionLoading(invitationId);
    await supabase.from("invitations").delete().eq("id", invitationId);
    setActionLoading(null);
    loadData();
  }

  async function handleDeactivate(userId: string) {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    setActionLoading(userId);
    const res = await fetch("/api/users/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    setActionLoading(null);

    if (!res.ok) {
      showError(data.error || "Failed to deactivate");
      return;
    }
    showSuccess("User deactivated");
    loadData();
  }

  async function handleReactivate(userId: string) {
    setActionLoading(userId);
    const res = await fetch("/api/users/reactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    setActionLoading(null);

    if (!res.ok) {
      showError(data.error || "Failed to reactivate");
      return;
    }
    showSuccess("User reactivated");
    loadData();
  }

  if (loading) {
    return <div className="text-gray-500 text-sm p-8">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
          {success}
        </div>
      )}

      {/* Invite Form */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Invite User
          </h2>
        </div>
        <form onSubmit={handleInvite} className="p-4 space-y-3">
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="vendor">Vendor</option>
            </select>
            {inviteRole === "vendor" && (
              <select
                value={inviteVendorId}
                onChange={(e) => setInviteVendorId(e.target.value)}
                required
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select vendor...</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={inviteLoading}
              className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {inviteLoading ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </form>
      </div>

      {/* Active Members */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Active Members ({members.length})
          </h2>
        </div>
        <div className="bg-gray-50 grid grid-cols-[1fr_1fr_100px_100px_80px] px-4 py-2 text-xs font-medium text-gray-500 uppercase border-b border-gray-300">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Joined</span>
          <span></span>
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[1fr_1fr_100px_100px_80px] px-4 py-2.5 text-sm border-b border-gray-200 items-center"
          >
            <span className="font-semibold text-gray-900">{m.full_name}</span>
            <span className="text-gray-600">{m.email}</span>
            <span>
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeColor[m.role]}`}
              >
                {roleLabel[m.role]}
              </span>
            </span>
            <span className="text-gray-500 text-xs">
              {new Date(m.created_at).toLocaleDateString()}
            </span>
            <span>
              {m.role !== "super_admin" && (
                <button
                  onClick={() => handleDeactivate(m.id)}
                  disabled={actionLoading === m.id}
                  className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  {actionLoading === m.id ? "..." : "Deactivate"}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              Pending Invitations ({invitations.length})
            </h2>
          </div>
          <div className="bg-gray-50 grid grid-cols-[1fr_100px_120px_100px] px-4 py-2 text-xs font-medium text-gray-500 uppercase border-b border-gray-300">
            <span>Email</span>
            <span>Role</span>
            <span>Expires</span>
            <span></span>
          </div>
          {invitations.map((inv) => {
            const expired = new Date(inv.expires_at) < new Date();
            return (
              <div
                key={inv.id}
                className="grid grid-cols-[1fr_100px_120px_100px] px-4 py-2.5 text-sm border-b border-gray-200 items-center"
              >
                <span className="text-gray-900">{inv.email}</span>
                <span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeColor[inv.role]}`}
                  >
                    {roleLabel[inv.role]}
                  </span>
                </span>
                <span className={`text-xs ${expired ? "text-red-600 font-medium" : "text-gray-500"}`}>
                  {expired ? "Expired" : new Date(inv.expires_at).toLocaleDateString()}
                </span>
                <span className="flex gap-2">
                  {expired && (
                    <button
                      onClick={() => handleResend(inv.id)}
                      disabled={actionLoading === inv.id}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      Resend
                    </button>
                  )}
                  <button
                    onClick={() => handleCancelInvite(inv.id)}
                    disabled={actionLoading === inv.id}
                    className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Deactivated Users */}
      {deactivated.length > 0 && (
        <div>
          <button
            onClick={() => setShowDeactivated((p) => !p)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {showDeactivated ? "Hide" : "Show"} Deactivated ({deactivated.length})
          </button>
          {showDeactivated && (
            <div className="mt-2 border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-800 px-4 py-2">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                  Deactivated Users
                </h2>
              </div>
              {deactivated.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-gray-200"
                >
                  <div>
                    <span className="font-semibold text-gray-500">{m.full_name}</span>
                    <span className="text-gray-400 ml-2 text-xs">
                      Deactivated {m.deactivated_at ? new Date(m.deactivated_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                  {myRole === "super_admin" && (
                    <button
                      onClick={() => handleReactivate(m.id)}
                      disabled={actionLoading === m.id}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      {actionLoading === m.id ? "..." : "Reactivate"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
