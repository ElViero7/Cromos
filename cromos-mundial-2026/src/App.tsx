import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AppShell,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Handshake,
  LayoutGrid,
  LogOut,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sticker,
  UserPlus,
  Users,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import {
  deriveInternalEmail,
  normalizeUsername,
  validateUsername,
} from './lib/usernameAuth';
import './App.css';

type AppTab = 'dashboard' | 'social' | 'market';
type DashboardSection = 'all' | 'fwc' | 'coca' | 'teams';

type Country = {
  id: string;
  iso: string;
  nombre: string;
};

type StickerRecord = {
  id: string;
  nombre: string;
  numero: number;
  posicion: string;
  pais: Country | null;
};

type CollectionRow = {
  cantidad: number;
  cromo_id: string;
  user_id: string;
};

type Profile = {
  avatar_url: string | null;
  id: string;
  username: string;
};

type Friendship = {
  created_at: string;
  created_by: string;
  id: string;
  status: 'pending' | 'accepted';
  user_id_1: string;
  user_id_2: string;
};

type RepeatedSticker = {
  cantidad: number;
  cromo_id: string;
  cromo_nombre: string;
  numero: number;
  pais: string;
  pais_iso: string;
  posicion: string;
  user_id: string;
  username: string;
};

type SearchResult = Profile & {
  relation: 'friend' | 'incoming' | 'outgoing' | 'none';
};

const countryLabelsEs: Record<string, string> = {
  ALG: 'Argelia',
  ARG: 'Argentina',
  AUS: 'Australia',
  AUT: 'Austria',
  BEL: 'Belgica',
  BIH: 'Bosnia y Herzegovina',
  BRA: 'Brasil',
  CAN: 'Canada',
  COD: 'Congo RD',
  COL: 'Colombia',
  COK: 'Coca-Cola',
  CRO: 'Croacia',
  CPV: 'Cabo Verde',
  CUW: 'Curazao',
  CZE: 'Chequia',
  ECU: 'Ecuador',
  EGY: 'Egipto',
  ENG: 'Inglaterra',
  ESP: 'Espana',
  FRA: 'Francia',
  FWC: 'FIFA World Cup',
  GER: 'Alemania',
  GHA: 'Ghana',
  HTI: 'Haiti',
  IRN: 'Iran',
  IRQ: 'Irak',
  JOR: 'Jordania',
  JPN: 'Japon',
  KOR: 'Corea del Sur',
  MAR: 'Marruecos',
  MEX: 'Mexico',
  NED: 'Paises Bajos',
  NOR: 'Noruega',
  NZL: 'Nueva Zelanda',
  PAN: 'Panama',
  PAR: 'Paraguay',
  POR: 'Portugal',
  QAT: 'Catar',
  RSA: 'Sudafrica',
  SAU: 'Arabia Saudi',
  SCO: 'Escocia',
  SEN: 'Senegal',
  SUI: 'Suiza',
  SWE: 'Suecia',
  TUN: 'Tunez',
  TUR: 'Turquia',
  URU: 'Uruguay',
  USA: 'Estados Unidos',
  UZB: 'Uzbekistan',
};

const appTabs: Array<{ icon: typeof LayoutGrid; label: string; value: AppTab }> = [
  { icon: LayoutGrid, label: 'Dashboard', value: 'dashboard' },
  { icon: Users, label: 'Social Hub', value: 'social' },
  { icon: ShoppingBag, label: 'Mercado', value: 'market' },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (mounted) {
        setSession(initialSession);
        setBooting(false);
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const ensureProfile = async () => {
      if (!session?.user) {
        return;
      }

      const rawUsername = session.user.user_metadata.username;

      if (typeof rawUsername !== 'string' || rawUsername.length === 0) {
        return;
      }

      const username = normalizeUsername(rawUsername);

      const { error } = await supabase.from('perfiles').upsert(
        {
          id: session.user.id,
          username,
        },
        {
          onConflict: 'id',
        },
      );

      if (error) {
        notifications.show({
          title: 'Perfil pendiente',
          message: 'La sesion esta activa, pero no se pudo sincronizar perfiles.',
          color: 'yellow',
        });
      }
    };

    void ensureProfile();
  }, [session?.user, session?.user?.id, session?.user?.user_metadata.username]);

  if (booting) {
    return (
      <div className="screen-loader">
        <Loader color="green" size="lg" />
      </div>
    );
  }

  return (
    <AppShell padding="lg" className="app-shell">
      <AppShell.Main>
        <Container size="xl" className="app-page">
          {session ? (
            <AuthenticatedApp
              session={session}
              onLogout={async () => {
                const { error } = await supabase.auth.signOut();

                if (error) {
                  notifications.show({
                    title: 'Error al cerrar sesion',
                    message: error.message,
                    color: 'red',
                  });
                  return;
                }

                notifications.show({
                  title: 'Sesion cerrada',
                  message: 'La sesion actual se ha cerrado correctamente.',
                  color: 'green',
                });
              }}
            />
          ) : (
            <AuthScreen />
          )}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function AuthScreen() {
  const [tab, setTab] = useState<string | null>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalized = normalizeUsername(username);
    const usernameError = validateUsername(normalized);

    if (usernameError) {
      notifications.show({
        title: 'Username no valido',
        message: usernameError,
        color: 'red',
      });
      return;
    }

    if (password.length < 6) {
      notifications.show({
        title: 'Contrasena no valida',
        message: 'Usa al menos 6 caracteres.',
        color: 'red',
      });
      return;
    }

    setSubmitting(true);

    const email = deriveInternalEmail(normalized);

    if (tab === 'register') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: normalized,
          },
        },
      });

      setSubmitting(false);

      if (error) {
        notifications.show({
          title: 'No se pudo crear la cuenta',
          message: error.message,
          color: 'red',
        });
        return;
      }

      notifications.show({
        title: 'Cuenta creada',
        message: 'La cuenta ya puede usarse con username y contrasena.',
        color: 'green',
      });
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (error) {
      notifications.show({
        title: 'No se pudo iniciar sesion',
        message: 'Revisa el username y la contrasena.',
        color: 'red',
      });
      return;
    }

    notifications.show({
      title: 'Sesion iniciada',
      message: 'Acceso correcto.',
      color: 'green',
    });
  };

  return (
    <Box className="auth-shell">
      <Card radius="xl" padding="xl" className="auth-card">
        <form onSubmit={submit}>
          <Stack gap="lg">
            <div>
              <Badge variant="light" color="green" radius="sm" mb="md">
                Cromos Mundial 2026
              </Badge>
              <Title order={1} className="auth-title">
                Entra o crea tu cuenta
              </Title>
              <Text className="auth-text">
                Acceso con username y contrasena.
              </Text>
            </div>

            <Tabs value={tab} onChange={setTab}>
              <Tabs.List grow>
                <Tabs.Tab value="login">Login</Tabs.Tab>
                <Tabs.Tab value="register">Registro</Tabs.Tab>
              </Tabs.List>
            </Tabs>

            <TextInput
              label="Username"
              placeholder="ej. javier_10"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              autoComplete="username"
              required
            />

            <PasswordInput
              label="Contrasena"
              placeholder="Tu contrasena"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
              required
            />

            <Text size="sm" c="dimmed">
              Username permitido: 3 a 20 caracteres, con letras minusculas,
              numeros, punto, guion o guion bajo.
            </Text>

            <Button type="submit" color="dark" loading={submitting}>
              {tab === 'register' ? 'Crear cuenta' : 'Entrar'}
            </Button>
          </Stack>
        </form>
      </Card>
    </Box>
  );
}

type AuthenticatedAppProps = {
  onLogout: () => Promise<void>;
  session: Session;
};

function AuthenticatedApp({ onLogout, session }: AuthenticatedAppProps) {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<DashboardSection>('teams');
  const [selectedSticker, setSelectedSticker] = useState<StickerRecord | null>(null);
  const [draftQuantity, setDraftQuantity] = useState<number>(0);
  const [searchValue, setSearchValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();
  const userId = session.user.id;
  const username = String(session.user.user_metadata.username ?? 'usuario');

  const countriesQuery = useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paises')
        .select('id, nombre, iso')
        .order('nombre');

      if (error) {
        throw error;
      }

      return (data ?? []) as Country[];
    },
  });

  const stickersQuery = useQuery({
    queryKey: ['stickers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cromos')
        .select('id, numero, nombre, posicion, pais:paises(id, nombre, iso)')
        .order('numero');

      if (error) {
        throw error;
      }

      return ((data ?? []) as unknown as StickerRecord[]).map((sticker) => ({
        ...sticker,
        pais: Array.isArray(sticker.pais) ? sticker.pais[0] ?? null : sticker.pais,
      }));
    },
  });

  const collectionQuery = useQuery({
    queryKey: ['collection', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coleccion_usuario')
        .select('user_id, cromo_id, cantidad')
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return (data ?? []) as CollectionRow[];
    },
  });

  const friendshipsQuery = useQuery({
    queryKey: ['friendships', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('amistades')
        .select('id, user_id_1, user_id_2, created_by, status, created_at')
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as Friendship[];
    },
  });

  const acceptedFriendsQuery = useQuery({
    queryKey: ['friends-profiles', userId, friendshipsQuery.data],
    enabled: Boolean(friendshipsQuery.data),
    queryFn: async () => {
      const accepted =
        friendshipsQuery.data?.filter((item) => item.status === 'accepted') ?? [];
      const friendIds = accepted.map((item) =>
        item.user_id_1 === userId ? item.user_id_2 : item.user_id_1,
      );

      if (friendIds.length === 0) {
        return [] as Profile[];
      }

      const { data, error } = await supabase
        .from('perfiles')
        .select('id, username, avatar_url')
        .in('id', friendIds)
        .order('username');

      if (error) {
        throw error;
      }

      return (data ?? []) as Profile[];
    },
  });

  const pendingProfilesQuery = useQuery({
    queryKey: ['pending-profiles', userId, friendshipsQuery.data],
    enabled: Boolean(friendshipsQuery.data),
    queryFn: async () => {
      const pendingIncoming =
        friendshipsQuery.data?.filter(
          (item) => item.status === 'pending' && item.created_by !== userId,
        ) ?? [];
      const ids = pendingIncoming.map((item) => item.created_by);

      if (ids.length === 0) {
        return [] as Profile[];
      }

      const { data, error } = await supabase
        .from('perfiles')
        .select('id, username, avatar_url')
        .in('id', ids)
        .order('username');

      if (error) {
        throw error;
      }

      return (data ?? []) as Profile[];
    },
  });

  const repeatedQuery = useQuery({
    queryKey: ['repeated-market', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_repetidos')
        .select(
          'user_id, username, cromo_id, numero, cromo_nombre, pais, pais_iso, posicion, cantidad',
        )
        .neq('user_id', userId)
        .order('numero');

      if (error) {
        throw error;
      }

      return (data ?? []) as RepeatedSticker[];
    },
  });

  const userSearchQuery = useQuery({
    queryKey: ['user-search', userId, searchTerm],
    enabled: searchTerm.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${searchTerm}%`)
        .neq('id', userId)
        .limit(12);

      if (error) {
        throw error;
      }

      const profiles = (data ?? []) as Profile[];
      const friendships = friendshipsQuery.data ?? [];

      return profiles.map((profile) => ({
        ...profile,
        relation: getRelation(profile.id, userId, friendships),
      })) as SearchResult[];
    },
  });

  const saveQuantityMutation = useMutation({
    mutationFn: async ({
      cromoId,
      cantidad,
    }: {
      cantidad: number;
      cromoId: string;
    }) => {
      if (cantidad <= 0) {
        const { error } = await supabase
          .from('coleccion_usuario')
          .delete()
          .eq('user_id', userId)
          .eq('cromo_id', cromoId);

        if (error) {
          throw error;
        }

        return;
      }

      const { error } = await supabase.from('coleccion_usuario').upsert(
        {
          user_id: userId,
          cromo_id: cromoId,
          cantidad,
        },
        {
          onConflict: 'user_id,cromo_id',
        },
      );

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collection', userId] });
      await queryClient.invalidateQueries({ queryKey: ['repeated-market', userId] });
      notifications.show({
        title: 'Coleccion actualizada',
        message: 'La cantidad del cromo se ha guardado.',
        color: 'green',
      });
      setSelectedSticker(null);
    },
    onError: (error: Error) => {
      notifications.show({
        title: 'No se pudo guardar',
        message: error.message,
        color: 'red',
      });
    },
  });

  const sendFriendRequestMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const pair = [userId, targetUserId].sort();
      const { error } = await supabase.from('amistades').insert({
        user_id_1: pair[0],
        user_id_2: pair[1],
        created_by: userId,
        status: 'pending',
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['friendships', userId] });
      await queryClient.invalidateQueries({ queryKey: ['user-search', userId] });
      notifications.show({
        title: 'Solicitud enviada',
        message: 'La peticion de amistad ya esta creada.',
        color: 'green',
      });
    },
    onError: (error: Error) => {
      notifications.show({
        title: 'No se pudo enviar',
        message: error.message,
        color: 'red',
      });
    },
  });

  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase
        .from('amistades')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['friendships', userId] });
      await queryClient.invalidateQueries({ queryKey: ['friends-profiles', userId] });
      await queryClient.invalidateQueries({ queryKey: ['repeated-market', userId] });
      notifications.show({
        title: 'Amistad aceptada',
        message: 'La relacion ya esta disponible para ver colecciones.',
        color: 'green',
      });
    },
    onError: (error: Error) => {
      notifications.show({
        title: 'No se pudo aceptar',
        message: error.message,
        color: 'red',
      });
    },
  });

  const countries = countriesQuery.data ?? [];
  const stickers = stickersQuery.data ?? [];
  const collection = collectionQuery.data ?? [];
  const friendships = friendshipsQuery.data ?? [];
  const acceptedFriends = acceptedFriendsQuery.data ?? [];
  const pendingProfiles = pendingProfilesQuery.data ?? [];
  const incomingRequests = friendships.filter(
    (item) => item.status === 'pending' && item.created_by !== userId,
  );
  const ownCollectionMap = new Map(collection.map((item) => [item.cromo_id, item.cantidad]));
  const teamCountries = countries.filter(
    (country) => country.iso !== 'FWC' && country.iso !== 'COK',
  );
  const filteredStickers = stickers.filter((item) => {
    const iso = item.pais?.iso;
    const matchesSection =
      sectionFilter === 'all'
        ? true
        : sectionFilter === 'fwc'
          ? iso === 'FWC'
          : sectionFilter === 'coca'
            ? iso === 'COK'
            : iso !== 'FWC' && iso !== 'COK';
    const matchesCountry = !countryFilter || item.pais?.id === countryFilter;
    const matchesPosition = !positionFilter || item.posicion === positionFilter;
    return matchesSection && matchesCountry && matchesPosition;
  });
  const positionOptions = Array.from(new Set(stickers.map((item) => item.posicion)))
    .sort()
    .map((posicion) => ({
      label: capitalize(posicion),
      value: posicion,
    }));
  const marketMatches = (repeatedQuery.data ?? []).filter(
    (item) => (ownCollectionMap.get(item.cromo_id) ?? 0) === 0,
  );

  const openStickerModal = (sticker: StickerRecord) => {
    setSelectedSticker(sticker);
    setDraftQuantity(ownCollectionMap.get(sticker.id) ?? 0);
  };

  return (
    <>
      <Stack gap="xl">
        <section className="hero-panel">
          <Group justify="space-between" align="flex-start" gap="lg">
            <div className="hero-copy">
              <Badge variant="light" color="green" radius="sm" mb="md">
                Sesion activa
              </Badge>
              <Title order={1} className="hero-title">
                {username}
              </Title>
            </div>

            <Button
              variant="subtle"
              color="dark"
              leftSection={<LogOut size={16} />}
              onClick={() => void onLogout()}
            >
              Cerrar sesion
            </Button>
          </Group>
        </section>

        <Tabs value={activeTab} onChange={(value) => setActiveTab((value as AppTab) ?? 'dashboard')}>
          <Tabs.List grow className="nav-tabs">
            {appTabs.map(({ icon: Icon, label, value }) => (
              <Tabs.Tab
                key={value}
                value={value}
                leftSection={<Icon size={16} />}
              >
                {label}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Tabs.Panel value="dashboard" pt="xl">
            <Stack gap="lg">
              <SegmentedControl
                fullWidth
                radius="xl"
                value={sectionFilter}
                onChange={(value) => {
                  setSectionFilter(value as DashboardSection);
                  if (value !== 'teams') {
                    setCountryFilter(null);
                  }
                }}
                data={[
                  { label: 'Selecciones', value: 'teams' },
                  { label: 'FWC', value: 'fwc' },
                  { label: 'Coca-Cola', value: 'coca' },
                  { label: 'Todo', value: 'all' },
                ]}
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label="Pais"
                  placeholder="Todos"
                  data={teamCountries.map((country) => ({
                    label: getCountryLabel(country),
                    value: country.id,
                  }))}
                  value={countryFilter}
                  onChange={setCountryFilter}
                  disabled={sectionFilter !== 'teams'}
                  searchable
                  nothingFoundMessage="No hay paises"
                  clearable
                />

                <Select
                  label="Posicion"
                  placeholder="Todas"
                  data={positionOptions}
                  value={positionFilter}
                  onChange={setPositionFilter}
                  clearable
                />
              </SimpleGrid>

              <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="md">
                <StatCard
                  icon={Sticker}
                  label="Cromos visibles"
                  value={String(filteredStickers.length)}
                />
                <StatCard
                  icon={ShieldCheck}
                  label="Coleccion total"
                  value={String(
                    collection.reduce((acc, item) => acc + item.cantidad, 0),
                  )}
                />
                <StatCard
                  icon={Users}
                  label="Amigos"
                  value={String(acceptedFriends.length)}
                />
                <StatCard
                  icon={ShoppingBag}
                  label="Oportunidades"
                  value={String(marketMatches.length)}
                />
              </SimpleGrid>

              {stickersQuery.isLoading || collectionQuery.isLoading ? (
                <Card className="empty-card">
                  <Loader color="green" />
                </Card>
              ) : filteredStickers.length === 0 ? (
                <EmptyState
                  title="No hay cromos para ese filtro"
                  text="Prueba a limpiar pais o posicion."
                />
              ) : (
                <SimpleGrid cols={{ base: 2, sm: 2, lg: 4 }} spacing="md">
                  {filteredStickers.map((sticker) => {
                    const quantity = ownCollectionMap.get(sticker.id) ?? 0;

                    return (
                      <Card
                        key={sticker.id}
                        className="sticker-card"
                        padding="lg"
                        radius="lg"
                        onClick={() => openStickerModal(sticker)}
                      >
                        <Stack gap="sm">
                          <Group justify="space-between" align="flex-start">
                            <Badge color="dark" variant="filled">
                              #{sticker.numero}
                            </Badge>
                            <Badge
                              color={quantity > 1 ? 'yellow' : quantity > 0 ? 'green' : 'gray'}
                              variant="light"
                            >
                              x{quantity}
                            </Badge>
                          </Group>

                          <div>
                            <Text fw={700} c="dark.8">
                              {sticker.nombre}
                            </Text>
                            <Text size="sm" c="dimmed">
                              {getCountryLabel(sticker.pais) ?? 'Sin pais'} ·{' '}
                              {labelForSticker(sticker)}
                            </Text>
                          </div>
                        </Stack>
                      </Card>
                    );
                  })}
                </SimpleGrid>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="social" pt="xl">
            <Stack gap="lg">
              <Group grow align="end" className="search-toolbar">
                <TextInput
                  label="Buscar usuario"
                  placeholder="username"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.currentTarget.value)}
                  leftSection={<Search size={16} />}
                />
                <Button color="dark" onClick={() => setSearchTerm(normalizeUsername(searchValue))}>
                  Buscar
                </Button>
              </Group>

              {searchTerm.length > 0 && searchTerm.length < 3 ? (
                <EmptyState
                  title="Busqueda demasiado corta"
                  text="Usa al menos 3 caracteres para buscar usernames."
                />
              ) : null}

              {userSearchQuery.isLoading ? (
                <Card className="empty-card">
                  <Loader color="green" />
                </Card>
              ) : null}

              {searchTerm.length >= 3 && !userSearchQuery.isLoading ? (
                <Card className="panel-card" padding="lg" radius="lg">
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Text fw={700}>Resultados</Text>
                      <Badge variant="light">{userSearchQuery.data?.length ?? 0}</Badge>
                    </Group>

                    {(userSearchQuery.data ?? []).length === 0 ? (
                      <Text c="dimmed" size="sm">
                        No hay usuarios para esa busqueda.
                      </Text>
                    ) : (
                      (userSearchQuery.data ?? []).map((profile) => (
                        <Group key={profile.id} justify="space-between" className="row-card">
                          <div>
                            <Text fw={600}>{profile.username}</Text>
                            <Text size="sm" c="dimmed">
                              Estado: {profile.relation}
                            </Text>
                          </div>

                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<UserPlus size={14} />}
                            disabled={profile.relation !== 'none'}
                            loading={sendFriendRequestMutation.isPending}
                            onClick={() => sendFriendRequestMutation.mutate(profile.id)}
                          >
                            {profile.relation === 'none' ? 'Enviar' : 'Bloqueado'}
                          </Button>
                        </Group>
                      ))
                    )}
                  </Stack>
                </Card>
              ) : null}

              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                <Card className="panel-card" padding="lg" radius="lg">
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Text fw={700}>Solicitudes pendientes</Text>
                      <Badge variant="light">{incomingRequests.length}</Badge>
                    </Group>

                    {incomingRequests.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No tienes solicitudes pendientes.
                      </Text>
                    ) : (
                      incomingRequests.map((request) => {
                        const profile = pendingProfiles.find(
                          (item) => item.id === request.created_by,
                        );

                        return (
                          <Group key={request.id} justify="space-between" className="row-card">
                            <div>
                              <Text fw={600}>{profile?.username ?? 'Usuario'}</Text>
                              <Text size="sm" c="dimmed">
                                Solicitud recibida
                              </Text>
                            </div>

                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<Handshake size={14} />}
                              loading={acceptFriendRequestMutation.isPending}
                              onClick={() => acceptFriendRequestMutation.mutate(request.id)}
                            >
                              Aceptar
                            </Button>
                          </Group>
                        );
                      })
                    )}
                  </Stack>
                </Card>

                <Card className="panel-card" padding="lg" radius="lg">
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Text fw={700}>Amigos</Text>
                      <Badge variant="light">{acceptedFriends.length}</Badge>
                    </Group>

                    {acceptedFriends.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Aun no tienes amistades aceptadas.
                      </Text>
                    ) : (
                      acceptedFriends.map((friend) => (
                        <Group key={friend.id} justify="space-between" className="row-card">
                          <div>
                            <Text fw={600}>{friend.username}</Text>
                            <Text size="sm" c="dimmed">
                              Coleccion visible por amistad aceptada
                            </Text>
                          </div>

                          <Badge color="green" variant="light">
                            amigo
                          </Badge>
                        </Group>
                      ))
                    )}
                  </Stack>
                </Card>
              </SimpleGrid>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="market" pt="xl">
            <Stack gap="lg">
              <Group justify="space-between">
                <div>
                  <Text fw={700} size="lg" c="dark.8">
                    Cromos que tus amigos repiten y tu no tienes
                  </Text>
                  <Text size="sm" c="dimmed">
                    Fuente: vista `v_repetidos` cruzada con tu coleccion.
                  </Text>
                </div>
                <Badge variant="light" color="green">
                  {marketMatches.length} resultados
                </Badge>
              </Group>

              {repeatedQuery.isLoading ? (
                <Card className="empty-card">
                  <Loader color="green" />
                </Card>
              ) : marketMatches.length === 0 ? (
                <EmptyState
                  title="Sin oportunidades ahora mismo"
                  text="Necesitas amigos con repetidos o datos en la coleccion para ver cruces."
                />
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  {marketMatches.map((item) => (
                    <Card key={`${item.user_id}-${item.cromo_id}`} className="panel-card" padding="lg" radius="lg">
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Badge color="dark" variant="filled">
                            #{item.numero}
                          </Badge>
                          <Badge color="yellow" variant="light">
                            {item.username} x{item.cantidad}
                          </Badge>
                        </Group>

                        <div>
                          <Text fw={700}>{item.cromo_nombre}</Text>
                          <Text size="sm" c="dimmed">
                            {translateCountryName(item.pais, item.pais_iso)} · {capitalize(item.posicion)}
                          </Text>
                        </div>
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <Modal
        opened={Boolean(selectedSticker)}
        onClose={() => setSelectedSticker(null)}
        title={selectedSticker ? `Cromo #${selectedSticker.numero}` : 'Editar cromo'}
        centered
      >
        {selectedSticker ? (
          <Stack gap="md">
            <div>
              <Text fw={700}>{selectedSticker.nombre}</Text>
              <Text size="sm" c="dimmed">
                {getCountryLabel(selectedSticker.pais) ?? 'Sin pais'} · {labelForSticker(selectedSticker)}
              </Text>
            </div>

            <NumberInput
              label="Cantidad"
              value={draftQuantity}
              onChange={(value) => setDraftQuantity(Number(value) || 0)}
              min={0}
              allowDecimal={false}
              clampBehavior="strict"
            />

            <Group grow>
              <Button
                variant="light"
                color="gray"
                onClick={() => setDraftQuantity((current) => Math.max(0, current - 1))}
              >
                -1
              </Button>
              <Button
                variant="light"
                color="green"
                onClick={() => setDraftQuantity((current) => current + 1)}
              >
                +1
              </Button>
            </Group>

            <Button
              color="dark"
              loading={saveQuantityMutation.isPending}
              onClick={() =>
                saveQuantityMutation.mutate({
                  cromoId: selectedSticker.id,
                  cantidad: draftQuantity,
                })
              }
            >
              Guardar
            </Button>
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sticker;
  label: string;
  value: string;
}) {
  return (
    <Card className="panel-card" padding="lg" radius="lg">
      <Stack gap="sm">
        <ThemeIcon size={42} radius="md" variant="light" color="green">
          <Icon size={20} />
        </ThemeIcon>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <Text fw={800} size="2rem" c="dark.8">
          {value}
        </Text>
      </Stack>
    </Card>
  );
}

function EmptyState({ title, text }: { text: string; title: string }) {
  return (
    <Card className="empty-card" padding="xl" radius="lg">
      <Stack gap="xs" align="center">
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="dimmed" ta="center">
          {text}
        </Text>
      </Stack>
    </Card>
  );
}

function getRelation(profileId: string, userId: string, friendships: Friendship[]) {
  const friendship = friendships.find(
    (item) => item.user_id_1 === profileId || item.user_id_2 === profileId,
  );

  if (!friendship) {
    return 'none' as const;
  }

  if (friendship.status === 'accepted') {
    return 'friend' as const;
  }

  return friendship.created_by === userId ? 'outgoing' : 'incoming';
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function labelForSticker(sticker: StickerRecord) {
  if (sticker.pais?.iso === 'FWC') {
    return 'FWC';
  }

  if (sticker.pais?.iso === 'COK') {
    return 'Coca-Cola';
  }

  return capitalize(sticker.posicion);
}

function getCountryLabel(country: Country | null) {
  if (!country) {
    return 'Sin pais';
  }

  return countryLabelsEs[country.iso] ?? country.nombre;
}

function translateCountryName(name: string, iso: string) {
  return countryLabelsEs[iso] ?? name;
}

export default App;
