import { isServer, QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();
function makeQueryClient() {
    return new QueryClient(
        // {
        //     defaultOptions: {
        //         queries: {
        //             staleTime: 1000 * 60 * 5,
        //         },
        //     },
        // }
    );
}

let browserQueryClient: QueryClient | undefined = undefined

export function getQueryClient() {
    if(isServer) {
        return makeQueryClient()
    } else {
        if(!browserQueryClient) browserQueryClient = makeQueryClient()
        return browserQueryClient
    }
}