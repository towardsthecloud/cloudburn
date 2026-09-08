import { AsyncLocalStorage } from 'node:async_hooks';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';

export type AwsClientCredentials = AwsCredentialIdentity | AwsCredentialIdentityProvider;

const awsClientCredentialsContext = new AsyncLocalStorage<{ credentials?: AwsClientCredentials }>();

/**
 * Runs a callback with ambient AWS credentials applied to every AWS client
 * created inside it, without requiring each call site to thread credentials.
 *
 * @param credentials - Credentials or credential provider to scope to the callback.
 * @param fn - Callback whose AWS client constructions should use the credentials.
 * @returns The callback result.
 */
export const withAwsClientCredentials = <T>(
  credentials: AwsClientCredentials | undefined,
  fn: () => Promise<T>,
): Promise<T> => awsClientCredentialsContext.run({ credentials }, fn);

/**
 * Reads the credentials scoped to the current callback without resolving a provider.
 * @returns The current credentials or provider, when supplied.
 */
export const resolveAwsClientCredentials = (): AwsClientCredentials | undefined =>
  awsClientCredentialsContext.getStore()?.credentials;
