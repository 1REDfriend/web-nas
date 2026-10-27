import { RULE_ROLES, RuleRole } from "@/lib/security/file-actions";
import { HardDrive, Inbox, KeyRound, LucideIcon, Send, ShieldAlert, Timer, User, Users } from "lucide-react";

export type SettingsSection = {
    href: string;
    label: string;
    icon: LucideIcon;
    // Who sees the link; each page checks the same list on the server
    roles: readonly RuleRole[];
};

export type SettingsGroup = {
    label: string;
    sections: SettingsSection[];
};

const EVERYONE: readonly RuleRole[] = RULE_ROLES;
export const MEMBERS: readonly RuleRole[] = ["ADMIN", "USER"];
export const ADMINS: readonly RuleRole[] = ["ADMIN"];

export const SETTINGS_GROUPS: SettingsGroup[] = [
    {
        label: "Account",
        sections: [
            { href: "/settings/account", label: "Profile", icon: User, roles: EVERYONE },
            { href: "/settings/api-keys", label: "API keys", icon: KeyRound, roles: MEMBERS },
            { href: "/settings/drops", label: "Drops", icon: Send, roles: MEMBERS },
            { href: "/settings/inboxes", label: "Upload links", icon: Inbox, roles: MEMBERS },
        ],
    },
    {
        label: "Administration",
        sections: [
            { href: "/settings/admin/users", label: "Users", icon: Users, roles: ADMINS },
            { href: "/settings/admin/storage", label: "Storage", icon: HardDrive, roles: ADMINS },
            { href: "/settings/admin/protected-folders", label: "Protected folders", icon: ShieldAlert, roles: ADMINS },
            { href: "/settings/admin/drops", label: "Drop limits", icon: Timer, roles: ADMINS },
            { href: "/settings/admin/inboxes", label: "Upload link limits", icon: Inbox, roles: ADMINS },
        ],
    },
];

export function settingsGroupsFor(role: RuleRole) {
    return SETTINGS_GROUPS
        .map((group) => ({ ...group, sections: group.sections.filter((s) => s.roles.includes(role)) }))
        .filter((group) => group.sections.length > 0);
}
