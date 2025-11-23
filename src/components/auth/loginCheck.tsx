import { userLoginCheck } from "@/lib/api/user/userLoginCheck";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginCheck() {
    const router = useRouter()
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        async function checker() {
            const token = await userLoginCheck()

            if (!token) {
                router.push('/auth/login');
            } else {
                setIsAuthenticated(true);
            }
            setLoading(false);
        }

        checker()
    }, [router])

    if (loading) return <p>Loading...</p>;
    if (!isAuthenticated) return null;
}
