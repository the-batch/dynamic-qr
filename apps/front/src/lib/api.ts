export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers: {
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...init?.headers,
        },
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new ApiError(payload?.error ?? 'La requête a échoué.', response.status);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
}