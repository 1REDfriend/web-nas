export type User = {
    id: string;
    username: string;
    role: "ADMIN" | "USER" | "GUEST";
    gmail?: string | null;
    createdAt: string;
};

export type GetUsersResponse = {
    users: User[];
    meta?: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
    message?: string;
};

export type DeleteUserResponse = {
    message: string;
    deletedUser?: {
        id: string;
        username: string;
    };
};

const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
};

export const fetchUsers = async (): Promise<GetUsersResponse> => {
    try {
        const res = await fetch("/api/admin/user/get?limit=100", {
            method: "GET",
            headers: getAuthHeaders(),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || "Failed to fetch users");
        }

        return await res.json();
    } catch (error) {
        console.error("Fetch Users Error:", error);
        throw error;
    }
};

export const deleteUserById = async (userId: string): Promise<DeleteUserResponse> => {
    try {
        const res = await fetch("/api/admin/user/delete", {
            method: "DELETE",
            headers: getAuthHeaders(),
            body: JSON.stringify({ userId }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Failed to delete user");
        }

        return data;
    } catch (error) {
        console.error("Delete User Error:", error);
        throw error;
    }
};