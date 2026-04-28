const USERNAME_PATTERN = /^[a-z0-9._-]{3,20}$/;

export const normalizeUsername = (value: string) =>
  value.trim().toLowerCase();

export const validateUsername = (value: string) => {
  if (!USERNAME_PATTERN.test(value)) {
    return 'Usa 3-20 caracteres: letras minúsculas, números, punto, guion o guion bajo.';
  }

  return null;
};

export const deriveInternalEmail = (username: string) =>
  `${username}@login.cromos.local`;
