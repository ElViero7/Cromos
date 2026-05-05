import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Drawer,
  Modal,
  NumberInput,
  PasswordInput,
  RingProgress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Handshake,
  Home,
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
import devSportsdbHeadshots from './data/devSportsdbHeadshots.json';
import devSportsdbSpainHeadshots from './data/devSportsdbSpainHeadshots.json';
import './App.css';

type AppTab = 'dashboard' | 'social' | 'market';
type DashboardSection = 'all' | 'fwc' | 'coca' | 'teams';

type Country = {
  id: string;
  iso: string;
  nombre: string;
};

type StickerRecord = {
  avatar_url: string | null;
  avatar_url_sportsdb: string | null;
  id: string;
  nombre: string;
  numero: string;
  posicion: string;
  pais: Country | null;
};

const devSportsdbHeadshotMap = devSportsdbHeadshots as Record<string, string>;
const devSportsdbSpainHeadshotMap = devSportsdbSpainHeadshots as Record<string, string>;

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
  avatar_url?: string | null;
  avatar_url_sportsdb?: string | null;
  cantidad: number;
  cromo_id: string;
  cromo_nombre: string;
  numero: string;
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
  CIV: 'Costa de Marfil',
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

const appTabs: Array<{ icon: typeof Home; label: string; value: AppTab }> = [
  { icon: Home, label: 'Coleccion', value: 'dashboard' },
  { icon: Users, label: 'Social', value: 'social' },
  { icon: ShoppingBag, label: 'Mercado', value: 'market' },
];

const dashboardSections: Array<{ label: string; value: DashboardSection }> = [
  { label: 'Selecciones', value: 'teams' },
  { label: 'FWC', value: 'fwc' },
  { label: 'Coca-Cola', value: 'coca' },
  { label: 'Todo', value: 'all' },
];

const countryDisplayOrder = [
  'FWC',
  'COK',
  'ALG',
  'ARG',
  'AUS',
  'AUT',
  'BEL',
  'BIH',
  'BRA',
  'CPV',
  'CAN',
  'CIV',
  'COL',
  'COD',
  'CRO',
  'CUW',
  'CZE',
  'ECU',
  'EGY',
  'ENG',
  'FRA',
  'GER',
  'GHA',
  'HTI',
  'IRQ',
  'IRN',
  'JPN',
  'JOR',
  'KOR',
  'MEX',
  'MAR',
  'NED',
  'NZL',
  'NOR',
  'PAN',
  'PAR',
  'POR',
  'QAT',
  'SAU',
  'SCO',
  'SEN',
  'RSA',
  'ESP',
  'SWE',
  'SUI',
  'TUN',
  'TUR',
  'URU',
  'USA',
  'UZB',
] as const;

const albumTeamCountryOrder = [
  'MEX',
  'RSA',
  'KOR',
  'CZE',
  'CAN',
  'BIH',
  'QAT',
  'SUI',
  'BRA',
  'MAR',
  'HTI',
  'SCO',
  'USA',
  'PAR',
  'AUS',
  'TUR',
  'GER',
  'CUW',
  'CIV',
  'ECU',
  'NED',
  'JPN',
  'SWE',
  'TUN',
  'BEL',
  'EGY',
  'IRN',
  'NZL',
  'ESP',
  'CPV',
  'SAU',
  'URU',
  'FRA',
  'SEN',
  'IRQ',
  'NOR',
  'ARG',
  'ALG',
  'AUT',
  'JOR',
  'POR',
  'COD',
  'UZB',
  'COL',
  'ENG',
  'CRO',
  'GHA',
  'PAN',
] as const;

const albumTeamCountryOrderIndex = new Map<string, number>(
  albumTeamCountryOrder.map((iso, index) => [iso, index]),
);

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
        <Container size="sm" className="app-page">
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

function getScrollableParent(element: HTMLElement | null) {
  let current = element?.parentElement ?? null;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;

    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
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

    if (mode === 'register') {
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
              <img
                src="/cromolink-logo-2026.png"
                alt="CromoLink 2026"
                className="brand-logo auth-brand-logo"
              />
              <Badge variant="light" color="green" radius="xl" mb="md">
                Cromos Mundial 2026
              </Badge>
              <Title order={1} className="auth-title">
                Acceso movil para tu coleccion
              </Title>
              <Text className="auth-text">
                Entra con username y contrasena para gestionar los cromos, amigos e intercambios.
              </Text>
            </div>

            <div className="auth-mode-switch">
              <button
                type="button"
                className={mode === 'login' ? 'auth-mode-button active' : 'auth-mode-button'}
                onClick={() => setMode('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'auth-mode-button active' : 'auth-mode-button'}
                onClick={() => setMode('register')}
              >
                Registro
              </button>
            </div>

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
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />

            <Text size="sm" c="dimmed">
              Username permitido: 3 a 20 caracteres, con letras minusculas, numeros, punto,
              guion o guion bajo.
            </Text>

            <Button type="submit" color="dark" loading={submitting} radius="xl" size="md">
              {mode === 'register' ? 'Crear cuenta' : 'Entrar'}
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
  const [countryDrawerOpened, setCountryDrawerOpened] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const selectedCountryChipRef = useRef<HTMLButtonElement | null>(null);
  const queryClient = useQueryClient();
  const userId = session.user.id;
  const username = String(session.user.user_metadata.username ?? 'usuario');

  function getStickerImageUrl(sticker: StickerRecord) {
    if (sticker.avatar_url_sportsdb) {
      return sticker.avatar_url_sportsdb;
    }

    if (import.meta.env.DEV && sticker.posicion !== 'escudo') {
      return (
        devSportsdbHeadshotMap[sticker.numero] ??
        devSportsdbSpainHeadshotMap[sticker.numero] ??
        sticker.avatar_url ??
        null
      );
    }

    return sticker.avatar_url ?? null;
  }

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
        .select('id, numero, nombre, posicion, avatar_url, avatar_url_sportsdb, pais:paises(id, nombre, iso)')
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
  const teamCountries = countries
    .filter((country) => country.iso !== 'FWC' && country.iso !== 'COK')
    .sort((left, right) => {
      const leftOrder = albumTeamCountryOrderIndex.get(left.iso) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = albumTeamCountryOrderIndex.get(right.iso) ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return getCountryLabel(left).localeCompare(getCountryLabel(right));
    });
  const filteredTeamCountries = teamCountries.filter((country) =>
    getCountryLabel(country).toLowerCase().includes(countrySearch.trim().toLowerCase()),
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
  const sortedFilteredStickers = [...filteredStickers].sort((left, right) => {
    const countryComparison = getCountryOrderValue(left.pais?.iso) - getCountryOrderValue(right.pais?.iso);

    if (countryComparison !== 0) {
      return countryComparison;
    }

    return getStickerNumberValue(left.numero) - getStickerNumberValue(right.numero);
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

  const collectedDistinct = stickers.reduce(
    (acc, sticker) => acc + (ownCollectionMap.get(sticker.id) ?? 0 > 0 ? 1 : 0),
    0,
  );
  const totalStickers = stickers.length;
  const missingDistinct = Math.max(totalStickers - collectedDistinct, 0);
  const completion = totalStickers === 0 ? 0 : Math.round((collectedDistinct / totalStickers) * 100);
  const totalUnits = collection.reduce((acc, item) => acc + item.cantidad, 0);
  const duplicateUnits = collection.reduce(
    (acc, item) => acc + Math.max(item.cantidad - 1, 0),
    0,
  );

  const openStickerModal = (sticker: StickerRecord) => {
    setSelectedSticker(sticker);
    setDraftQuantity(ownCollectionMap.get(sticker.id) ?? 0);
  };

  const scrollSelectedCountryIntoView = () => {
    const selectedChip = selectedCountryChipRef.current;
    const scrollParent = getScrollableParent(selectedChip);

    if (!selectedChip || !scrollParent) {
      return;
    }

    const parentRect = scrollParent.getBoundingClientRect();
    const chipRect = selectedChip.getBoundingClientRect();
    const currentScrollTop = scrollParent.scrollTop;
    const targetScrollTop =
      currentScrollTop +
      (chipRect.top - parentRect.top) -
      scrollParent.clientHeight / 2 +
      selectedChip.clientHeight / 2;

    scrollParent.scrollTo({
      top: Math.max(targetScrollTop, 0),
      behavior: 'auto',
    });
  };

  useEffect(() => {
    if (!countryDrawerOpened) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      scrollSelectedCountryIntoView();
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [countryDrawerOpened, countryFilter, filteredTeamCountries]);

  return (
    <>
      <div className="mobile-app-shell">
        <header className="mobile-topbar">
          <div className="topbar-brand">
            <img
              src="/cromolink-logo-2026.png"
              alt="CromoLink 2026"
              className="brand-logo topbar-logo"
            />
            <Text className="eyebrow-text">Mi album</Text>
            <Title order={1} className="screen-title">
              {activeTab === 'dashboard'
                ? 'Collection'
                : activeTab === 'social'
                  ? 'Social'
                  : 'Market'}
            </Title>
            <Text className="screen-subtitle">@{username}</Text>
          </div>

          <ActionIcon
            variant="default"
            radius="xl"
            size="xl"
            className="topbar-action"
            onClick={() => void onLogout()}
            aria-label="Cerrar sesion"
          >
            <LogOut size={18} />
          </ActionIcon>
        </header>

        <main className="mobile-screen">
          {activeTab === 'dashboard' ? (
            <Stack gap="lg">
              <button
                type="button"
                className="floating-selection-trigger"
                onClick={() => {
                  setCountrySearch('');
                  setCountryDrawerOpened(true);
                }}
              >
                <span className="floating-selection-label">Seleccion</span>
                <span className="floating-selection-value">
                  {countryFilter
                    ? getCountryLabel(teamCountries.find((country) => country.id === countryFilter) ?? null)
                    : 'Todas'}
                </span>
              </button>

              <section className="hero-panel collection-hero">
                <div className="collection-progress">
                  <RingProgress
                    size={212}
                    thickness={24}
                    roundCaps
                    sections={[{ value: completion, color: '#202124' }]}
                    rootColor="#d9dadd"
                    label={
                      <div className="progress-center">
                        <span className="progress-value">{completion}%</span>
                        <span className="progress-label">COLLECTION</span>
                      </div>
                    }
                  />
                </div>

                <div className="collection-meta-grid">
                  <MiniMetric label="Collected" value={String(collectedDistinct)} tone="dark" />
                  <MiniMetric label="Missing" value={String(missingDistinct)} tone="muted" />
                  <MiniMetric label="Duplicados" value={String(duplicateUnits)} tone="accent" />
                </div>
              </section>

              <section className="chip-scroll" aria-label="Filtrar seccion">
                {dashboardSections.map((section) => (
                  <button
                    key={section.value}
                    type="button"
                    className={
                      sectionFilter === section.value ? 'filter-chip active' : 'filter-chip'
                    }
                    onClick={() => {
                      setSectionFilter(section.value);
                      if (section.value !== 'teams') {
                        setCountryFilter(null);
                      }
                    }}
                  >
                    {section.label}
                  </button>
                ))}
              </section>

              <Card className="panel-card filter-panel" padding="lg" radius="xl">
                <Stack gap="md">
                  <Group justify="space-between">
                      <Text fw={700}>Vista de cromos</Text>
                      <Badge variant="light" color="dark" radius="xl">
                      {sortedFilteredStickers.length}
                      </Badge>
                  </Group>

                  <SimpleGrid cols={{ base: 1 }} spacing="sm">
                    <Select
                      label="Posicion"
                      placeholder="Todas"
                      data={positionOptions}
                      value={positionFilter}
                      onChange={setPositionFilter}
                      clearable
                    />
                  </SimpleGrid>

                  <div className="summary-strip">
                    <SummaryPill icon={Sticker} label="Cromos" value={String(totalStickers)} />
                    <SummaryPill icon={ShieldCheck} label="Total" value={String(totalUnits)} />
                    <SummaryPill icon={Users} label="Amigos" value={String(acceptedFriends.length)} />
                    <SummaryPill icon={ShoppingBag} label="Mercado" value={String(marketMatches.length)} />
                  </div>
                </Stack>
              </Card>

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
                <div className="sticker-grid compact-sticker-grid">
                  {sortedFilteredStickers.map((sticker) => {
                    const quantity = ownCollectionMap.get(sticker.id) ?? 0;

                    return (
                      <button
                        key={sticker.id}
                        type="button"
                        className={
                          quantity > 1
                            ? 'sticker-card mobile-sticker-card is-duplicate'
                            : quantity > 0
                              ? 'sticker-card mobile-sticker-card is-owned'
                              : 'sticker-card mobile-sticker-card'
                        }
                        onClick={() => openStickerModal(sticker)}
                      >
                        <div className="sticker-silhouette" aria-hidden="true">
                          {getStickerImageUrl(sticker) ? (
                            <img
                              src={getStickerImageUrl(sticker) ?? undefined}
                              alt={sticker.nombre}
                              className="sticker-main-avatar-image"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : sticker.posicion === 'escudo' &&
                            sticker.pais?.iso &&
                            sticker.pais.iso !== 'FWC' &&
                            sticker.pais.iso !== 'COK' ? (
                            <img
                              src={getShieldSrc(sticker.pais.iso)}
                              alt={`Escudo de ${getCountryLabel(sticker.pais)}`}
                              className="sticker-main-shield-image"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : sticker.nombre === 'Equipo' ? (
                            <img
                              src="/team-placeholder.svg"
                              alt={`Placeholder de equipo para ${sticker.nombre}`}
                              className="sticker-main-avatar-image"
                            />
                          ) : (
                            <img
                              src="/player-placeholder.svg"
                              alt={`Placeholder de ${sticker.nombre}`}
                              className="sticker-main-avatar-image"
                            />
                          )}
                        </div>

                        <div className="sticker-card-body">
                          <div className="sticker-card-header">
                            <span className="sticker-number">#{formatStickerNumber(sticker.numero)}</span>
                            <span
                              className={
                                quantity > 1
                                  ? 'sticker-qty sticker-qty-dup'
                                  : quantity > 0
                                    ? 'sticker-qty sticker-qty-own'
                                    : 'sticker-qty'
                              }
                            >
                              x{quantity}
                            </span>
                          </div>
                          <Text fw={700} className="sticker-name">
                            {sticker.nombre}
                          </Text>
                          <div className="sticker-meta-row">
                            <Text size="sm" c="dimmed" className="sticker-meta">
                              {compactLabelForSticker(sticker)}
                            </Text>
                            {sticker.pais?.iso &&
                            sticker.pais.iso !== 'FWC' &&
                            sticker.pais.iso !== 'COK' ? (
                              <div className="sticker-mini-shield">
                                <img
                                  src={getShieldSrc(sticker.pais.iso)}
                                  alt={`Escudo de ${getCountryLabel(sticker.pais)}`}
                                  className="sticker-mini-shield-image"
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Stack>
          ) : null}

          {activeTab === 'social' ? (
            <Stack gap="lg">
              <Card className="panel-card section-card" padding="lg" radius="xl">
                <Stack gap="md">
                  <div>
                    <Text fw={800} size="lg">
                      Buscar usuarios
                    </Text>
                    <Text size="sm" c="dimmed">
                      Encuentra amigos para comparar y conseguir cromos repetidos.
                    </Text>
                  </div>

                  <div className="search-bar-panel">
                    <TextInput
                      placeholder="username"
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.currentTarget.value)}
                      leftSection={<Search size={16} />}
                    />
                    <Button color="dark" radius="xl" onClick={() => setSearchTerm(normalizeUsername(searchValue))}>
                      Buscar
                    </Button>
                  </div>

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
                    <div className="stacked-list">
                      {(userSearchQuery.data ?? []).length === 0 ? (
                        <Text c="dimmed" size="sm">
                          No hay usuarios para esa busqueda.
                        </Text>
                      ) : (
                        (userSearchQuery.data ?? []).map((profile) => (
                          <SocialRow
                            key={profile.id}
                            title={profile.username}
                            subtitle={`Estado: ${profile.relation}`}
                            action={
                              <Button
                                size="xs"
                                variant="light"
                                color="dark"
                                radius="xl"
                                leftSection={<UserPlus size={14} />}
                                disabled={profile.relation !== 'none'}
                                loading={sendFriendRequestMutation.isPending}
                                onClick={() => sendFriendRequestMutation.mutate(profile.id)}
                              >
                                {profile.relation === 'none' ? 'Enviar' : 'Bloqueado'}
                              </Button>
                            }
                          />
                        ))
                      )}
                    </div>
                  ) : null}
                </Stack>
              </Card>

              <Card className="panel-card section-card" padding="lg" radius="xl">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text fw={800} size="lg">
                      Solicitudes pendientes
                    </Text>
                    <Badge variant="light" color="dark" radius="xl">
                      {incomingRequests.length}
                    </Badge>
                  </Group>

                  {incomingRequests.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No tienes solicitudes pendientes.
                    </Text>
                  ) : (
                    <div className="stacked-list">
                      {incomingRequests.map((request) => {
                        const profile = pendingProfiles.find((item) => item.id === request.created_by);

                        return (
                          <SocialRow
                            key={request.id}
                            title={profile?.username ?? 'Usuario'}
                            subtitle="Solicitud recibida"
                            action={
                              <Button
                                size="xs"
                                variant="light"
                                color="green"
                                radius="xl"
                                leftSection={<Handshake size={14} />}
                                loading={acceptFriendRequestMutation.isPending}
                                onClick={() => acceptFriendRequestMutation.mutate(request.id)}
                              >
                                Aceptar
                              </Button>
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </Stack>
              </Card>

              <Card className="panel-card section-card" padding="lg" radius="xl">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text fw={800} size="lg">
                      Amigos
                    </Text>
                    <Badge variant="light" color="green" radius="xl">
                      {acceptedFriends.length}
                    </Badge>
                  </Group>

                  {acceptedFriends.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      Aun no tienes amistades aceptadas.
                    </Text>
                  ) : (
                    <div className="stacked-list">
                      {acceptedFriends.map((friend) => (
                        <SocialRow
                          key={friend.id}
                          title={friend.username}
                          subtitle="Coleccion visible por amistad aceptada"
                          action={
                            <Badge color="green" variant="light" radius="xl">
                              amigo
                            </Badge>
                          }
                        />
                      ))}
                    </div>
                  )}
                </Stack>
              </Card>
            </Stack>
          ) : null}

          {activeTab === 'market' ? (
            <Stack gap="lg">
              <section className="hero-panel market-hero">
                <Text className="eyebrow-text">Intercambios</Text>
                <Title order={2} className="market-title">
                  Cromos que tus amigos repiten y tu no tienes
                </Title>
                <Text className="hero-text">
                  Vista cruzada entre `v_repetidos` y tu coleccion para detectar oportunidades.
                </Text>
                <div className="market-highlight">
                  <span className="market-count">{marketMatches.length}</span>
                  <span className="market-caption">resultados disponibles</span>
                </div>
              </section>

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
                <div className="market-list">
                  {marketMatches.map((item) => (
                    <Card
                      key={`${item.user_id}-${item.cromo_id}`}
                      className="panel-card market-card"
                      padding="lg"
                      radius="xl"
                    >
                      <Stack gap="sm">
                        <Group justify="space-between" align="flex-start">
                          <div>
                            <Text fw={800} size="lg">
                              #{formatStickerNumber(item.numero)} {item.cromo_nombre}
                            </Text>
                            <Text size="sm" c="dimmed">
                              {translateCountryName(item.pais, item.pais_iso)} · {capitalize(item.posicion)}
                            </Text>
                          </div>

                          <Badge color="dark" variant="filled" radius="xl">
                            x{item.cantidad}
                          </Badge>
                        </Group>

                        <div className="trade-pill">
                          <Users size={16} />
                          <span>{item.username} lo repite</span>
                        </div>
                      </Stack>
                    </Card>
                  ))}
                </div>
              )}
            </Stack>
          ) : null}
        </main>

        <nav className="bottom-nav" aria-label="Navegacion principal">
          {appTabs.map(({ icon: Icon, label, value }) => (
            <button
              key={value}
              type="button"
              className={activeTab === value ? 'bottom-nav-item active' : 'bottom-nav-item'}
              onClick={() => setActiveTab(value)}
            >
              <span className="bottom-nav-icon">
                <Icon size={20} />
              </span>
              <span className="bottom-nav-label">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <Modal
        opened={Boolean(selectedSticker)}
        onClose={() => setSelectedSticker(null)}
        title={
          selectedSticker ? `Cromo #${formatStickerNumber(selectedSticker.numero)}` : 'Editar cromo'
        }
        centered
      >
        {selectedSticker ? (
          <Stack gap="md">
            <div>
              {getStickerImageUrl(selectedSticker) ? (
                <div className="sticker-modal-portrait">
                  <img
                    src={getStickerImageUrl(selectedSticker) ?? undefined}
                    alt={selectedSticker.nombre}
                    className="sticker-modal-portrait-image"
                  />
                </div>
              ) : selectedSticker.posicion !== 'escudo' ? (
                <div className="sticker-modal-portrait">
                  <img
                    src="/player-placeholder.svg"
                    alt={`Placeholder de ${selectedSticker.nombre}`}
                    className="sticker-modal-portrait-image"
                  />
                </div>
              ) : null}
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
                radius="xl"
                onClick={() => setDraftQuantity((current) => Math.max(0, current - 1))}
              >
                -1
              </Button>
              <Button
                variant="light"
                color="green"
                radius="xl"
                onClick={() => setDraftQuantity((current) => current + 1)}
              >
                +1
              </Button>
            </Group>

            <Button
              color="dark"
              radius="xl"
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

      <Drawer
        opened={countryDrawerOpened}
        onClose={() => setCountryDrawerOpened(false)}
        onEnterTransitionEnd={scrollSelectedCountryIntoView}
        position="bottom"
        size="min(78vh, 42rem)"
        radius="24px 24px 0 0"
        title="Cambiar seleccion"
        classNames={{
          body: 'country-drawer-body',
          content: 'country-drawer-content',
          header: 'country-drawer-header',
          title: 'country-drawer-title',
        }}
      >
        <div className="country-drawer-actions">
          <TextInput
            placeholder="Buscar seleccion"
            value={countrySearch}
            onChange={(event) => setCountrySearch(event.currentTarget.value)}
            className="country-drawer-search"
          />

          <button
            type="button"
            className={!countryFilter ? 'country-chip active' : 'country-chip'}
            onClick={() => {
              setSectionFilter('teams');
              setCountryFilter(null);
              setCountryDrawerOpened(false);
            }}
          >
            <span className="country-chip-name">Todas las selecciones</span>
            <span className="country-chip-meta">Ver album completo</span>
          </button>

          {filteredTeamCountries.map((country) => (
            <button
              key={country.id}
              ref={countryFilter === country.id ? selectedCountryChipRef : null}
              type="button"
              className={countryFilter === country.id ? 'country-chip active' : 'country-chip'}
              onClick={() => {
                setSectionFilter('teams');
                setCountryFilter(country.id);
                setCountryDrawerOpened(false);
              }}
            >
              <span className="country-chip-crest">
                <img
                  src={getShieldSrc(country.iso)}
                  alt={`Escudo de ${getCountryLabel(country)}`}
                  className="country-chip-image"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
                <span className="country-chip-fallback">{country.iso}</span>
              </span>
              <span className="country-chip-copy">
                <span className="country-chip-name">{getCountryLabel(country)}</span>
                <span className="country-chip-meta">{country.iso}</span>
              </span>
            </button>
          ))}
        </div>
      </Drawer>
    </>
  );
}

function MiniMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'accent' | 'dark' | 'muted';
  value: string;
}) {
  return (
    <div className={`mini-metric mini-metric-${tone}`}>
      <span className="mini-metric-value">{value}</span>
      <span className="mini-metric-label">{label}</span>
    </div>
  );
}

function SummaryPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sticker;
  label: string;
  value: string;
}) {
  return (
    <div className="summary-pill">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SocialRow({
  action,
  subtitle,
  title,
}: {
  action: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="row-card social-row">
      <div>
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="dimmed">
          {subtitle}
        </Text>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, text }: { text: string; title: string }) {
  return (
    <Card className="empty-card" padding="xl" radius="xl">
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
    (item) =>
      (item.user_id_1 === userId && item.user_id_2 === profileId) ||
      (item.user_id_2 === userId && item.user_id_1 === profileId),
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

function compactLabelForSticker(sticker: StickerRecord) {
  if (sticker.pais?.iso === 'FWC') {
    return 'FWC';
  }

  if (sticker.pais?.iso === 'COK') {
    return 'Coca-Cola';
  }

  const compactLabels: Record<string, string> = {
    centrocampista: 'Centroc.',
    delantero: 'Delantero',
    defensa: 'Defensa',
    escudo: 'Escudo',
    especial: 'Especial',
    portero: 'Portero',
  };

  return compactLabels[sticker.posicion] ?? capitalize(sticker.posicion);
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

function getShieldSrc(iso: string) {
  return `/shields/${iso}.png`;
}

function getStickerNumberValue(numero: string) {
  const match = numero.match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function formatStickerNumber(numero: string) {
  const match = numero.match(/(\d+)$/);
  return match ? match[1] : numero;
}

function getCountryOrderValue(iso?: string | null) {
  const index = countryDisplayOrder.indexOf(
    (iso ?? '') as (typeof countryDisplayOrder)[number],
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export default App;
