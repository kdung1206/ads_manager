// ---------------------------------------------------------------------------
// Shared between client and server so both agree on roles. Role meaning in
// this app (see plan): Admin manages platform connections/credentials,
// Editor is the ads team member who creates/edits/deletes campaigns, Viewer
// is read-only. Kept as the same 3 names as marketing_report_v2 on purpose —
// merging the two user tables later needs no redesign.
// ---------------------------------------------------------------------------

export interface UserAccount {
  username: string;
  passwordHash?: string;
  salt?: string;
  newPassword?: string; // client → server only, for POST /api/save-users
  name: string;
  role: "Admin" | "Editor" | "Viewer";
}

// Seeded Admin — change this password after first login (Kết nối nền tảng
// has no password-change UI yet in phase 1; rotate by editing this file and
// bumping USERS_CONFIG_VERSION, or wait for the Users admin screen).
// Plaintext: AdsManager@2026 — internal dev tool only, rotate before sharing
// this project outside the ads team.
export const DEFAULT_USERS: UserAccount[] = [
  {
    username: "admin",
    salt: "489129fe3cccd5fff84853897499ffa1",
    passwordHash: "scrypt:3b63a3edb0b780af1cee4d257e2b2a847b2db8b36ad2f0acc37121c5f53d64302aebc5c90e54b23859b16191b23d54cdecf78adf3ae032da17196ccd3de6e352",
    name: "Quản trị Ads Manager",
    role: "Admin",
  },
];

// Merges the seeded DEFAULT_USERS with whatever's actually in the store: a
// default username that's already been saved (e.g. admin's password/name/role
// changed via the Users screen) keeps the saved row, not the hardcoded seed —
// the seed only fills in usernames the store doesn't have yet (first run).
export function reconcileUsers(savedList: UserAccount[]): UserAccount[] {
  const savedByUsername = new Map(savedList.filter((u) => typeof u.username === "string").map((u) => [u.username.toLowerCase(), u]));
  const merged = DEFAULT_USERS.map((defaultUser) => savedByUsername.get(defaultUser.username.toLowerCase()) || defaultUser);
  const defaultUsernames = new Set(DEFAULT_USERS.map((u) => u.username.toLowerCase()));
  const customExtras = savedList.filter(
    (u: any) =>
      !defaultUsernames.has((u.username || "").toLowerCase()) &&
      typeof u.username === "string" &&
      typeof u.role === "string"
  );
  return [...merged, ...customExtras];
}
