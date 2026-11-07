import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient, apiError } from '../client'

export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async ({ signal }) => {
      const { data, error, response } = await getApiClient().GET('/auth/me', {
        signal,
      })
      if (error) throw apiError(response, error)
      return data!
    },
    retry: false,
    staleTime: 60_000,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const { data, error, response } = await getApiClient().POST(
        '/auth/login',
        { body },
      )
      if (error) throw apiError(response, error)
      return data!
    },
    onSuccess: async () => {
      await queryClient.cancelQueries()
      queryClient.clear()
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      email: string
      password: string
      handle: string
      displayName: string
      timezone?: string
    }) => {
      const { data, error, response } = await getApiClient().POST(
        '/auth/register',
        { body },
      )
      if (error) throw apiError(response, error)
      return data!
    },
    onSuccess: async () => {
      await queryClient.cancelQueries()
      queryClient.clear()
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await getApiClient().POST('/auth/logout')
      if (error) throw apiError(response, error)
    },
    onSuccess: async () => {
      await queryClient.cancelQueries()
      queryClient.clear()
    },
  })
}
