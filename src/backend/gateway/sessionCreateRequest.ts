export interface SessionCreateParameters {
  directory: string;
}

export function createSessionParameters(directory: string): SessionCreateParameters {
  return { directory };
}
