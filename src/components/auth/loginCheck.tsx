'use client'

import { userLoginCheck } from "@/lib/api/user/userLoginCheck";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginCheck() {
    const router = useRouter()
    const searcharams = useSearchParams()
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        async function checker() {
            const token = await userLoginCheck()

            if (token.registor) {
                router.push('/auth/registor');
            } else if (!token || !token.login) {
                router.push('/auth/login');
            } else {
                setIsAuthenticated(true);
            }
            setLoading(false);
        }

        checker()
    }, [router, searcharams])

    if (loading) return <p>Loading...</p>;

    if (!isAuthenticated) return null;

    return null;
}
