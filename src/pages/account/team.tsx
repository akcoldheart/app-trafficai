import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconUsersGroup,
  IconUserPlus,
  IconTrash,
  IconLoader2,
  IconCheck,
  IconAlertCircle,
  IconLogout,
  IconCrown,
  IconEye,
  IconEyeOff,
} from '@tabler/icons-react';

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  email: string;
  full_name: string | null;
}

interface TeamData {
  team: {
    id: string;
    name: string;
    max_seats: number;
    owner_user_id: string;
  } | null;
  role: string;
  members: TeamMember[];
  owner: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  seatUsage: {
    used: number;
    max: number;
  };
}

export default function TeamPage() {
  const { user, refreshUser } = useAuth();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Add member form
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [showPassword, setShowPassword] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  const fetchTeamData = useCallback(async () => {
    try {
      const res = await fetch('/api/team');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Team API error:', res.status, errData);
        setMessage({ type: 'error', text: errData.error || `Failed to load team data (${res.status})` });
        return;
      }
      const data = await res.json();
      setTeamData(data);
    } catch (err) {
      console.error('Team fetch error:', err);
      setMessage({ type: 'error', text: 'Failed to load team data' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  const createTeam = async () => {
    setCreatingTeam(true);
    try {
      const res = await fetch('/api/team/create', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to create team' });
        return;
      }
      await fetchTeamData();
      await refreshUser();
      setMessage({ type: 'success', text: 'Team created successfully!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to create team' });
    } finally {
      setCreatingTeam(false);
    }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmail.trim() || !memberPassword.trim()) return;
    setAddingMember(true);
    setMessage(null);

    try {
      const res = await fetch('/api/team/add-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: memberEmail.trim(),
          password: memberPassword.trim(),
          fullName: memberName.trim() || undefined,
          role: memberRole,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to add member' });
        return;
      }

      setMessage({ type: 'success', text: `Team member ${memberEmail} created successfully!` });
      setMemberEmail('');
      setMemberPassword('');
      setMemberName('');
      await fetchTeamData();
    } catch {
      setMessage({ type: 'error', text: 'Failed to add member' });
    } finally {
      setAddingMember(false);
    }
  };

  const updateMemberRole = async (memberId: string, role: 'admin' | 'member') => {
    setUpdatingRoleId(memberId);
    setMessage(null);
    try {
      const res = await fetch(`/api/team/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to update role' });
        return;
      }

      setMessage({ type: 'success', text: data.message || 'Member role updated' });
      await fetchTeamData();
    } catch {
      setMessage({ type: 'error', text: 'Failed to update role' });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const removeMember = async (memberId: string) => {
    setRemovingId(memberId);
    try {
      const res = await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to remove member' });
        return;
      }

      setMessage({ type: 'success', text: data.message });
      await fetchTeamData();
      await refreshUser();
    } catch {
      setMessage({ type: 'error', text: 'Failed to remove member' });
    } finally {
      setRemovingId(null);
    }
  };

  const leaveTeam = async () => {
    if (!teamData?.members) return;
    const myMembership = teamData.members.find(m => m.user_id === user?.id);
    if (!myMembership) return;

    if (!confirm('Are you sure you want to leave this team? You will lose access to shared data.')) return;

    await removeMember(myMembership.id);
  };

  if (loading) {
    return (
      <Layout>
        <div className="page-header d-print-none">
          <div className="container-xl">
            <div className="page-pretitle">Account</div>
            <h2 className="page-title">Team</h2>
          </div>
        </div>
        <div className="page-body">
          <div className="container-xl">
            <div className="d-flex justify-content-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const isOwner = teamData?.role === 'owner';
  const isMember = teamData?.role === 'member' || teamData?.role === 'admin';
  const hasTeam = !!teamData?.team;
  const seatsFull = teamData?.seatUsage ? teamData.seatUsage.used >= teamData.seatUsage.max : false;

  return (
    <Layout>
      <div className="page-header d-print-none">
        <div className="container-xl">
          <div className="row align-items-center">
            <div className="col-auto">
              <div className="page-pretitle">Account</div>
              <h2 className="page-title">Team</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="container-xl">
          {/* Status Message */}
          {message && (
            <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} alert-dismissible mb-3`}>
              <div className="d-flex align-items-center">
                {message.type === 'success' ? <IconCheck size={18} className="me-2" /> : <IconAlertCircle size={18} className="me-2" />}
                {message.text}
              </div>
              <button type="button" className="btn-close" onClick={() => setMessage(null)} />
            </div>
          )}

          {/* No Team - Create One */}
          {!hasTeam && (
            <div className="card">
              <div className="card-body text-center py-5">
                <IconUsersGroup size={48} className="text-muted mb-3" />
                <h3>Create Your Team</h3>
                <p className="text-muted mb-4">
                  Add team members to share your pixels, visitors, audiences, and integrations.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={createTeam}
                  disabled={creatingTeam}
                >
                  {creatingTeam ? (
                    <>
                      <IconLoader2 className="icon-tabler-loading me-2" size={18} />
                      Creating...
                    </>
                  ) : (
                    <>
                      <IconUsersGroup size={18} className="me-2" />
                      Create Team
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Team Exists */}
          {hasTeam && (
            <div className="row row-deck row-cards">
              {/* Seat Usage Card */}
              <div className="col-12">
                <div className="card">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <div>
                        <h3 className="card-title mb-1">{teamData?.team?.name}</h3>
                        <p className="text-muted mb-0">
                          {isOwner ? 'You are the team owner' : `You are a team ${teamData?.role}`}
                        </p>
                      </div>
                      {teamData?.seatUsage && (
                        <div className="text-end">
                          <span className="h3 mb-0">
                            {teamData.seatUsage.used} / {teamData.seatUsage.max}
                          </span>
                          <div className="text-muted">seats used</div>
                        </div>
                      )}
                    </div>
                    {teamData?.seatUsage && (
                      <div className="progress progress-sm">
                        <div
                          className={`progress-bar ${seatsFull ? 'bg-danger' : 'bg-primary'}`}
                          style={{ width: `${Math.min(100, (teamData.seatUsage.used / teamData.seatUsage.max) * 100)}%` }}
                        />
                      </div>
                    )}
                    {seatsFull && isOwner && (
                      <p className="text-danger mt-2 mb-0" style={{ fontSize: '13px' }}>
                        All seats are filled. Upgrade your plan to add more team members.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Members List */}
              <div className="col-12">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <IconUsersGroup size={20} className="me-2" />
                      Team Members
                    </h3>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-vcenter card-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Joined</th>
                          {isOwner && <th className="w-1">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Owner row */}
                        {teamData?.owner && (
                          <tr>
                            <td>
                              <div className="d-flex align-items-center">
                                {teamData.owner.full_name || 'No name'}
                                <IconCrown size={16} className="ms-2 text-warning" title="Team Owner" />
                              </div>
                            </td>
                            <td className="text-muted">{teamData.owner.email}</td>
                            <td>
                              <span className="badge bg-purple-lt">Owner</span>
                            </td>
                            <td className="text-muted">-</td>
                            {isOwner && <td></td>}
                          </tr>
                        )}
                        {/* Member rows */}
                        {teamData?.members?.map((member) => (
                          <tr key={member.id}>
                            <td>{member.full_name || 'No name'}</td>
                            <td className="text-muted">{member.email}</td>
                            <td>
                              {isOwner ? (
                                <div className="d-flex align-items-center">
                                  <select
                                    className="form-select form-select-sm"
                                    style={{ width: 'auto', minWidth: '110px' }}
                                    value={member.role}
                                    onChange={(e) => updateMemberRole(member.id, e.target.value as 'admin' | 'member')}
                                    disabled={updatingRoleId === member.id || removingId === member.id}
                                  >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                  {updatingRoleId === member.id && (
                                    <IconLoader2 className="ms-2" size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                  )}
                                </div>
                              ) : (
                                <span className={`badge ${member.role === 'admin' ? 'bg-blue-lt' : 'bg-green-lt'}`}>
                                  {member.role === 'admin' ? 'Admin' : 'Member'}
                                </span>
                              )}
                            </td>
                            <td className="text-muted">
                              {new Date(member.joined_at).toLocaleDateString()}
                            </td>
                            {isOwner && (
                              <td>
                                <button
                                  className="btn btn-ghost-danger btn-icon btn-sm"
                                  onClick={() => {
                                    if (confirm(`Remove ${member.email} from the team?`)) {
                                      removeMember(member.id);
                                    }
                                  }}
                                  disabled={removingId === member.id}
                                  title="Remove member"
                                >
                                  {removingId === member.id ? (
                                    <IconLoader2 className="icon-tabler-loading" size={18} />
                                  ) : (
                                    <IconTrash size={18} />
                                  )}
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {(!teamData?.members || teamData.members.length === 0) && (
                          <tr>
                            <td colSpan={isOwner ? 5 : 4} className="text-center text-muted py-4">
                              No team members yet. Add one below.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Add Member Form (Owner only) */}
              {isOwner && (
                <div className="col-12">
                  <div className="card">
                    <div className="card-header">
                      <h3 className="card-title">
                        <IconUserPlus size={20} className="me-2" />
                        Add Team Member
                      </h3>
                    </div>
                    <div className="card-body">
                      <form onSubmit={addMember}>
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label">Full Name</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Team member's name"
                              value={memberName}
                              onChange={(e) => setMemberName(e.target.value)}
                              disabled={seatsFull}
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Email Address</label>
                            <input
                              type="email"
                              className="form-control"
                              placeholder="member@company.com"
                              value={memberEmail}
                              onChange={(e) => setMemberEmail(e.target.value)}
                              required
                              disabled={seatsFull}
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Password</label>
                            <div className="input-group">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-control"
                                placeholder="Min 6 characters"
                                value={memberPassword}
                                onChange={(e) => setMemberPassword(e.target.value)}
                                required
                                minLength={6}
                                disabled={seatsFull}
                              />
                              <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                              >
                                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                              </button>
                            </div>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Role</label>
                            <select
                              className="form-select"
                              value={memberRole}
                              onChange={(e) => setMemberRole(e.target.value)}
                              disabled={seatsFull}
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <div className="col-12">
                            <button
                              type="submit"
                              className="btn btn-primary"
                              disabled={addingMember || seatsFull || !memberEmail.trim() || !memberPassword.trim()}
                            >
                              {addingMember ? (
                                <>
                                  <IconLoader2 className="icon-tabler-loading me-2" size={18} />
                                  Creating...
                                </>
                              ) : (
                                <>
                                  <IconUserPlus size={18} className="me-2" />
                                  Add Member
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 text-muted" style={{ fontSize: '13px' }}>
                          This creates a login account for the team member. Share the email and password with them so they can log in.
                          <br />
                          <strong>Member:</strong> Can view shared data and submit pixel/audience requests, but cannot delete pixels or audiences.{' '}
                          <strong>Admin:</strong> Full access — same permissions as the team owner.
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}

              {/* Leave Team (Member only) */}
              {isMember && (
                <div className="col-12">
                  <div className="card">
                    <div className="card-body">
                      <div className="d-flex align-items-center justify-content-between">
                        <div>
                          <h3 className="mb-1">Leave Team</h3>
                          <p className="text-muted mb-0">
                            You will lose access to all shared data. This action cannot be undone.
                          </p>
                        </div>
                        <button
                          className="btn btn-outline-danger"
                          onClick={leaveTeam}
                        >
                          <IconLogout size={18} className="me-2" />
                          Leave Team
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
