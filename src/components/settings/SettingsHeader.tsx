import { ReactNode } from "react";

type SettingsHeaderProps = {
    title: string;
    description?: ReactNode;
    // Buttons on the right of the title, e.g. "Add user"
    actions?: ReactNode;
};

export function SettingsHeader({ title, description, actions }: SettingsHeaderProps) {
    return (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-semibold text-slate-50 sm:text-xl">{title}</h2>
                {description && <p className="text-sm text-slate-400">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
    );
}
