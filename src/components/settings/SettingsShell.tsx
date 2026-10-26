"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { FileManagerTopBar } from "@/components/file-manager/FileManagerTopBar";
import { RuleRole } from "@/lib/security/file-actions";
import { settingsGroupsFor } from "./sections";

type SettingsShellProps = {
    role: RuleRole;
    children: ReactNode;
};

// Shared frame of every /settings page: the app header, the list of sections
// (a column on desktop, a scrolling row of tabs on phones) and the open section.
export function SettingsShell({ role, children }: SettingsShellProps) {
    const router = useRouter();
    const pathname = usePathname() ?? "";
    const groups = settingsGroupsFor(role);
    const tabsRef = useRef<HTMLUListElement>(null);

    // Phones: bring the open section's tab into view, it may sit past the right edge
    useEffect(() => {
        tabsRef.current
            ?.querySelector('[aria-current="page"]')
            ?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [pathname]);

    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

    return (
        <div className="flex min-h-dvh flex-col bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
            <FileManagerTopBar nav={{ selectedFolder: "", onSelectFolder: () => router.push("/") }} />

            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-3 py-4 sm:px-6 sm:py-8 md:flex-row md:gap-10">
                <nav aria-label="Settings" className="md:w-56 md:shrink-0">
                    <Link
                        href="/"
                        className="mb-4 hidden items-center gap-2 text-sm text-slate-400 hover:text-slate-100 md:inline-flex"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to files
                    </Link>
                    <h1 className="mb-3 text-xl font-bold tracking-tight md:mb-6 md:text-2xl">Settings</h1>

                    {/* Phones: one row of tabs that scrolls sideways */}
                    <ul ref={tabsRef} className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:hidden">
                        {groups.flatMap((group) => group.sections).map((section) => {
                            const Icon = section.icon;
                            const active = isActive(section.href);
                            return (
                                <li key={section.href} className="shrink-0">
                                    <Link
                                        href={section.href}
                                        aria-current={active ? "page" : undefined}
                                        className={`flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
                                            active
                                                ? "border-rose-500/60 bg-rose-500/10 text-slate-50"
                                                : "border-white/10 text-slate-400 hover:text-slate-100"
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {section.label}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="hidden space-y-6 md:block md:sticky md:top-8">
                        {groups.map((group) => (
                            <div key={group.label}>
                                <p className="mb-2 px-3 text-xs font-semibold uppercase text-slate-500">{group.label}</p>
                                <ul className="space-y-1">
                                    {group.sections.map((section) => {
                                        const Icon = section.icon;
                                        const active = isActive(section.href);
                                        return (
                                            <li key={section.href}>
                                                <Link
                                                    href={section.href}
                                                    aria-current={active ? "page" : undefined}
                                                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                                                        active
                                                            ? "bg-white/10 font-medium text-slate-50"
                                                            : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                                                    }`}
                                                >
                                                    <Icon className="h-4 w-4" />
                                                    {section.label}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                </nav>

                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
