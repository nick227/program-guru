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

/** Consumes a single-use verification token from the emailed link. */
export function useVerifyEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error, response } = await getApiClient().POST('/auth/verify-email', { body: { token } })
      if (error) throw apiError(response, error)
      return data!
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
}

/** Sends a fresh verification link to the signed-in user (no-op once verified). */
export function useResendVerification() {
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await getApiClient().POST('/auth/verify-email/resend')
      if (error) throw apiError(response, error)
      return data!
    },
  })
}

/** Always succeeds, so it never reveals whether an address has an account. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (body: { email: string }) => {
      const { data, error, response } = await getApiClient().POST('/auth/forgot-password', { body })
      if (error) throw apiError(response, error)
      return data!
    },
  })
}

/** Sets a new password from the emailed token. The server signs out every session, so cached data goes too. */
export function useResetPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { token: string; password: string }) => {
      const { data, error, response } = await getApiClient().POST('/auth/reset-password', { body })
      if (error) throw apiError(response, error)
      return data!
    },
    onSuccess: async () => {
      await queryClient.cancelQueries()
      queryClient.clear()
    },
  })
}
