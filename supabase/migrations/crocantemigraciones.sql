-- Crocante · todas las migraciones en orden
-- Generado por scripts/bundle-migrations.mjs el 2026-09-08
-- Pegar completo en el SQL Editor de Supabase y ejecutar una sola vez.
-- Es idempotente: volver a correrlo no rompe nada.


-- ========================================================================
-- 20260907000001_initial_schema.sql
-- ========================================================================

-- Crocante · esquema inicial
-- Todas las tablas llevan id uuid, created_at y (cuando corresponde) updated_at.

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------- enums

do $$ begin
  create type transaction_type as enum ('expense', 'income', 'transfer', 'refund', 'adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_source as enum ('manual', 'natural_language', 'receipt', 'import', 'ai', 'seed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category_kind as enum ('expense', 'income', 'transfer', 'investment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type budget_period as enum ('weekly', 'monthly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_kind as enum ('cash', 'debit', 'credit', 'transfer', 'wallet', 'other');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ utilities

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Texto normalizado (sin acentos, minúsculas) usado para comparar comercios.
create or replace function public.normalize_text(value text)
returns text
language sql
immutable
as $$
  select coalesce(lower(unaccent(trim(value))), '');
$$;

-- --------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default 'Mi cuenta',
  avatar_url text,
  base_currency text not null default 'ARS',
  locale text not null default 'es-AR',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  ai_preferences jsonb not null default jsonb_build_object(
    'autosave_threshold', 0.9,
    'ask_threshold', 0.7,
    'learn_from_corrections', true,
    'share_data_with_ai', true
  ),
  onboarding_done boolean not null default false,
  favorite_category_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  base_currency text not null default 'ARS',
  split_mode text not null default 'equal' check (split_mode in ('equal', 'income_ratio', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member', 'viewer')),
  display_name text not null default '',
  share numeric(5,4) not null default 0.5,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  kind category_kind not null default 'expense',
  icon text not null default 'Tag',
  color text not null default '#0f766e',
  position integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, slug)
);

create table if not exists public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (category_id, slug)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  currency text not null default 'ARS',
  kind text not null default 'checking' check (kind in ('checking', 'savings', 'cash', 'investment', 'wallet')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind payment_kind not null default 'other',
  issuer text,
  -- Solo los últimos 4 dígitos: nunca se guarda un número de tarjeta completo.
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  default_category_id uuid references public.categories(id) on delete set null,
  default_subcategory_id uuid references public.subcategories(id) on delete set null,
  tax_id text,
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid,
  storage_path text,
  thumbnail_path text,
  merchant_name text,
  merchant_tax_id text,
  receipt_number text,
  receipt_date date,
  currency text not null default 'ARS',
  subtotal numeric(14,2),
  discount numeric(14,2),
  tax numeric(14,2),
  total numeric(14,2),
  ocr_raw_text text,
  ocr_confidence numeric(4,3),
  ocr_provider text not null default 'mock',
  parsed_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  type transaction_type not null default 'expense',
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ARS',
  base_amount numeric(14,2) not null,
  base_currency text not null default 'ARS',
  exchange_rate numeric(14,6) not null default 1,
  description text not null,
  merchant_id uuid references public.merchants(id) on delete set null,
  merchant_name text,
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  transaction_date date not null default current_date,
  notes text,
  source transaction_source not null default 'manual',
  ai_confidence numeric(4,3),
  receipt_id uuid references public.receipts(id) on delete set null,
  is_recurring boolean not null default false,
  recurring_id uuid,
  paid_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.receipts
  drop constraint if exists receipts_transaction_id_fkey,
  add constraint receipts_transaction_id_fkey
    foreign key (transaction_id) references public.transactions(id) on delete set null;

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  description text not null,
  quantity numeric(10,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  description text not null,
  quantity numeric(10,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  period budget_period not null default 'monthly',
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ARS',
  category_id uuid references public.categories(id) on delete cascade,
  subcategory_id uuid references public.subcategories(id) on delete cascade,
  alert_thresholds numeric(3,2)[] not null default '{0.8,0.9,1}',
  starts_on date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Presupuestos que abarcan varias categorías a la vez.
create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (budget_id, category_id)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  description text,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0,
  currency text not null default 'ARS',
  target_date date,
  monthly_contribution numeric(14,2),
  icon text not null default 'Target',
  color text not null default '#0f766e',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null default 'ARS',
  note text,
  contributed_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_currency text not null default 'ARS',
  quote_currency text not null,
  rate numeric(16,6) not null check (rate > 0),
  rate_date date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'api', 'seed')),
  created_at timestamptz not null default now(),
  unique (user_id, base_currency, quote_currency, rate_date)
);

create table if not exists public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  match_type text not null default 'contains' check (match_type in ('exact', 'contains')),
  category_id uuid not null references public.categories(id) on delete cascade,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  strategy text not null default 'ask' check (strategy in ('always', 'ask')),
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, pattern)
);

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  label text not null,
  average_amount numeric(14,2),
  currency text not null default 'ARS',
  cadence text,
  occurrences integer not null default 0,
  last_date date,
  next_estimated_date date,
  category_id uuid references public.categories(id) on delete set null,
  confirmed boolean,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('parse', 'categorize', 'insight', 'query', 'receipt')),
  provider text not null,
  model text not null default '',
  input text not null default '',
  output text not null default '',
  confidence numeric(4,3),
  latency_ms integer not null default 0,
  success boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'system' check (kind in ('budget_alert', 'goal_progress', 'recurring_detected', 'system')),
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- indexes

create index if not exists transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category_id);
create index if not exists transactions_user_type_idx on public.transactions (user_id, type);
create index if not exists transactions_household_idx on public.transactions (household_id) where household_id is not null;
create index if not exists transactions_merchant_idx on public.transactions (user_id, merchant_name);
create index if not exists transaction_items_tx_idx on public.transaction_items (transaction_id);
create index if not exists receipts_user_idx on public.receipts (user_id, created_at desc);
create index if not exists receipt_items_receipt_idx on public.receipt_items (receipt_id);
create index if not exists categories_user_idx on public.categories (user_id, position);
create index if not exists subcategories_category_idx on public.subcategories (category_id, position);
create index if not exists budgets_user_idx on public.budgets (user_id) where is_active;
create index if not exists goals_user_idx on public.goals (user_id) where not is_archived;
create index if not exists ai_interactions_user_idx on public.ai_interactions (user_id, created_at desc);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ------------------------------------------------------------- triggers

do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'households', 'categories', 'subcategories', 'transactions',
    'budgets', 'goals', 'categorization_rules'
  ] loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();',
      target
    );
  end loop;
end $$;


-- ========================================================================
-- 20260907000002_category_taxonomy.sql
-- ========================================================================

-- Generated by scripts/generate-category-seed.mjs — do not edit by hand.
-- Source of truth: src/constants/categories.ts

create or replace function public.default_category_taxonomy()
returns jsonb
language sql
immutable
as $function$
  select '[{"slug":"alimentacion","name":"Alimentación","kind":"expense","icon":"ShoppingCart","color":"#0f766e","subcategories":[{"slug":"supermercado","name":"Supermercado","keywords":["super","supermercado","carrefour","coto","jumbo","disco","vea","dia","chango mas","changomas","walmart","la anonima","toledo","libertad","makro","vital","mayorista","diarco","maxiconsumo","compras del super","mandados"]},{"slug":"almacen","name":"Almacén","keywords":["almacen","kiosco","kiosko","despensa","autoservicio","chino"]},{"slug":"carniceria","name":"Carnicería","keywords":["carniceria","carne","asado","pollo","milanesas","cerdo","achuras"]},{"slug":"verduleria","name":"Verdulería","keywords":["verduleria","verdura","fruta","frutas","frutera","huerta"]},{"slug":"panaderia","name":"Panadería","keywords":["panaderia","pan","facturas","medialunas","confiteria"]},{"slug":"delivery","name":"Delivery","keywords":["delivery","pedidosya","pedidos ya","rappi","ubereats","uber eats","mandaditos"]},{"slug":"restaurante","name":"Restaurante","keywords":["restaurante","resto","cena","almuerzo","parrilla","sushi","bodegon","cervezeria","bar","pizzeria","pizza","empanadas"]},{"slug":"cafe","name":"Café","keywords":["cafe","starbucks","cafeteria","havanna","merienda","cafecito"]},{"slug":"comida-rapida","name":"Comida rápida","keywords":["mcdonalds","mc donalds","burger king","mostaza","wendys","subway","hamburguesa","lomito","pancho"]}]},{"slug":"transporte","name":"Transporte","kind":"expense","icon":"Car","color":"#2563eb","subcategories":[{"slug":"combustible","name":"Combustible","keywords":["nafta","combustible","gasoil","gnc","ypf","shell","axion","puma energy","puma","estacion de servicio","surtidor","cargue nafta","carga de nafta"]},{"slug":"transporte-publico","name":"Transporte público","keywords":["sube","colectivo","bondi","subte","tren","micro","omnibus","boleto"]},{"slug":"taxi","name":"Taxi","keywords":["taxi","remis","remise"]},{"slug":"apps-movilidad","name":"Uber/Cabify","keywords":["uber","cabify","didi","beat","viaje en uber"]},{"slug":"estacionamiento","name":"Estacionamiento","keywords":["estacionamiento","cochera","parking","parquimetro"]},{"slug":"peajes","name":"Peajes","keywords":["peaje","telepase","autopista","ausa"]},{"slug":"mantenimiento-auto","name":"Mantenimiento","keywords":["taller","mecanico","service del auto","cubiertas","neumaticos","lavadero","vtv","patente","seguro del auto","gomeria"]}]},{"slug":"hogar","name":"Hogar","kind":"expense","icon":"Home","color":"#7c3aed","subcategories":[{"slug":"alquiler","name":"Alquiler","keywords":["alquiler","renta","inmobiliaria","garantia del alquiler"]},{"slug":"expensas","name":"Expensas","keywords":["expensas","consorcio","administracion del edificio"]},{"slug":"electricidad","name":"Electricidad","keywords":["luz","electricidad","edesur","edenor","edelap","epec","edea","factura de luz"]},{"slug":"gas","name":"Gas","keywords":["gas","metrogas","camuzzi","naturgy","garrafa"]},{"slug":"agua","name":"Agua","keywords":["agua","aysa","absa","aguas cordobesas"]},{"slug":"internet","name":"Internet","keywords":["internet","fibertel","flow","telecentro","wifi","iplan","starlink"]},{"slug":"telefonia","name":"Telefonía","keywords":["celular","telefono","personal","claro","movistar","tuenti","recarga"]},{"slug":"limpieza","name":"Limpieza","keywords":["limpieza","detergente","lavandina","articulos de limpieza","empleada","cif","ayudin"]},{"slug":"mantenimiento-hogar","name":"Mantenimiento","keywords":["plomero","electricista","ferreteria","pintura","easy","sodimac","sanitarios","arreglo","mueble","colchon","electrodomestico"]}]},{"slug":"salud","name":"Salud","kind":"expense","icon":"HeartPulse","color":"#e11d48","subcategories":[{"slug":"obra-social","name":"Obra social","keywords":["obra social","prepaga","osde","swiss medical","galeno","medife","omint","sancor salud"]},{"slug":"farmacia","name":"Farmacia","keywords":["farmacia","farmacity","remedios","medicamento","ibuprofeno","pharmacy","dr ahorro"]},{"slug":"medico","name":"Médico","keywords":["medico","consulta medica","clinica","guardia","turno medico","kinesiologia","psicologo","terapia","nutricionista"]},{"slug":"odontologia","name":"Odontología","keywords":["dentista","odontologo","ortodoncia","muela"]},{"slug":"estudios-medicos","name":"Estudios","keywords":["analisis","laboratorio","radiografia","resonancia","ecografia","estudios medicos"]}]},{"slug":"educacion","name":"Educación","kind":"expense","icon":"GraduationCap","color":"#0891b2","subcategories":[{"slug":"colegio","name":"Colegio","keywords":["colegio","escuela","cuota del colegio","jardin","guarderia"]},{"slug":"universidad","name":"Universidad","keywords":["universidad","facultad","utn","uba","siglo 21","maestria","posgrado"]},{"slug":"cursos","name":"Cursos","keywords":["curso","capacitacion","udemy","platzi","coursera","taller de","ingles","idiomas"]},{"slug":"libros","name":"Libros","keywords":["libro","libreria","yenny","cuspide","ateneo","apunte"]},{"slug":"materiales","name":"Materiales","keywords":["utiles","utiles escolares","cuaderno","mochila escolar","fotocopias"]}]},{"slug":"entretenimiento","name":"Entretenimiento","kind":"expense","icon":"Clapperboard","color":"#d946ef","subcategories":[{"slug":"streaming","name":"Streaming","keywords":["netflix","spotify","disney","hbo","max","prime video","star plus","youtube premium","apple tv","crunchyroll","suscripcion","paramount"]},{"slug":"cine","name":"Cine","keywords":["cine","cinemark","hoyts","showcase","entradas de cine"]},{"slug":"juegos","name":"Juegos","keywords":["steam","playstation","xbox","nintendo","juego","gaming","epic games"]},{"slug":"salidas","name":"Salidas","keywords":["salida","boliche","birra con","joda","previa","copas"]},{"slug":"eventos","name":"Eventos","keywords":["recital","concierto","entradas","ticketek","teatro","festival","partido"]}]},{"slug":"ropa","name":"Ropa","kind":"expense","icon":"Shirt","color":"#f97316","subcategories":[{"slug":"indumentaria","name":"Indumentaria","keywords":["ropa","remera","pantalon","campera","jean","zara","h&m","kevingston","indumentaria","buzo","vestido"]},{"slug":"calzado","name":"Calzado","keywords":["zapatillas","zapatos","botas","sandalias","calzado","grimoldi","stock center","dexter"]},{"slug":"accesorios","name":"Accesorios","keywords":["accesorios","gorra","cinturon","mochila","lentes","reloj","bijou"]}]},{"slug":"deporte","name":"Deporte","kind":"expense","icon":"Dumbbell","color":"#16a34a","subcategories":[{"slug":"gimnasio","name":"Gimnasio","keywords":["gym","gimnasio","sportclub","megatlon","cuota del gym","crossfit","pilates","yoga"]},{"slug":"equipamiento","name":"Equipamiento","keywords":["pesas","mancuernas","equipamiento deportivo","bicicleta","raqueta","pelota"]},{"slug":"club","name":"Club","keywords":["club","cuota del club","socio"]},{"slug":"futbol","name":"Fútbol/Futsal","keywords":["futbol","futsal","cancha","partido de futbol","papi futbol","botines"]},{"slug":"entrenamiento","name":"Entrenamiento","keywords":["entrenador","personal trainer","running","natacion","padel","tenis"]}]},{"slug":"finanzas","name":"Finanzas","kind":"expense","icon":"Landmark","color":"#64748b","subcategories":[{"slug":"comisiones","name":"Comisiones","keywords":["comision","mantenimiento de cuenta","costo bancario","sellado"]},{"slug":"intereses","name":"Intereses","keywords":["interes","intereses","punitorios","financiacion"]},{"slug":"impuestos","name":"Impuestos","keywords":["impuesto","afip","arca","monotributo","ingresos brutos","arba","agip","iva","abl","inmobiliario","ganancias"]},{"slug":"prestamos","name":"Préstamos","keywords":["prestamo","cuota del prestamo","credito personal","hipoteca"]},{"slug":"tarjetas","name":"Tarjetas","keywords":["tarjeta","resumen de tarjeta","visa","mastercard","amex","pago de tarjeta"]}]},{"slug":"personal","name":"Personal","kind":"expense","icon":"Sparkles","color":"#db2777","subcategories":[{"slug":"regalos","name":"Regalos","keywords":["regalo","cumpleanos","aguinaldo para","presente","navidad"]},{"slug":"cuidado-personal","name":"Cuidado personal","keywords":["peluqueria","barberia","shampoo","perfume","cosmetica","manicura","depilacion","crema","desodorante","higiene"]},{"slug":"mascotas","name":"Mascotas","keywords":["veterinaria","mascota","perro","gato","alimento balanceado","pipeta"]},{"slug":"otros","name":"Otros","keywords":["otros","varios","sin categoria"]}]},{"slug":"inversiones","name":"Inversiones","kind":"investment","icon":"TrendingUp","color":"#0d9488","subcategories":[{"slug":"dolar","name":"Dólar","keywords":["dolar","dolares","compra de dolares","mep","ccl","blue"]},{"slug":"acciones","name":"Acciones","keywords":["acciones","cedear","cedears","bolsa"]},{"slug":"bonos","name":"Bonos","keywords":["bono","bonos","al30","gd30","lecap"]},{"slug":"fondos","name":"Fondos","keywords":["fci","fondo comun","money market","plazo fijo"]},{"slug":"cripto","name":"Cripto","keywords":["cripto","bitcoin","btc","usdt","ethereum","binance","lemon","belo"]}]},{"slug":"ingresos","name":"Ingresos","kind":"income","icon":"Wallet","color":"#15803d","subcategories":[{"slug":"sueldo","name":"Sueldo","keywords":["sueldo","salario","cobre el sueldo","aguinaldo","quincena","haberes"]},{"slug":"freelance","name":"Freelance","keywords":["freelance","factura","honorarios","changa","proyecto","cliente"]},{"slug":"ventas","name":"Ventas","keywords":["venta","vendi","marketplace","mercado libre venta"]},{"slug":"transferencias","name":"Transferencias","keywords":["transferencia recibida","me transfirieron","me pasaron"]},{"slug":"reintegros","name":"Reintegros","keywords":["reintegro","devolucion","me devolvieron","cashback","reembolso"]},{"slug":"otros-ingresos","name":"Otros","keywords":["otro ingreso","premio","regalo recibido","alquiler cobrado"]}]}]'::jsonb;
$function$;

comment on function public.default_category_taxonomy() is
  'Categorías y subcategorías por defecto (generadas desde src/constants/categories.ts).';


-- ========================================================================
-- 20260907000003_rls.sql
-- ========================================================================

-- Crocante · Row Level Security
-- Regla base: cada persona ve y modifica únicamente sus propios datos.
-- Los datos compartidos se habilitan sólo a través de household_members.

-- Miembro de un hogar (security definer para evitar recursión en las policies).
create or replace function public.is_household_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target and m.user_id = auth.uid()
  );
$$;

create or replace function public.owns_transaction(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.transactions t
    where t.id = target
      and (t.user_id = auth.uid() or (t.household_id is not null and public.is_household_member(t.household_id)))
  );
$$;

create or replace function public.owns_receipt(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.receipts r where r.id = target and r.user_id = auth.uid());
$$;

create or replace function public.owns_goal(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.goals g where g.id = target and g.user_id = auth.uid());
$$;

create or replace function public.owns_budget(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.budgets b where b.id = target and b.user_id = auth.uid());
$$;

-- RLS activo en todas las tablas. Nunca se desactiva "para que funcione".
do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'households', 'household_members', 'categories', 'subcategories',
    'accounts', 'payment_methods', 'merchants', 'transactions', 'transaction_items',
    'receipts', 'receipt_items', 'budgets', 'budget_categories', 'goals',
    'goal_contributions', 'exchange_rates', 'categorization_rules',
    'recurring_expenses', 'ai_interactions', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security;', target);
    execute format('alter table public.%I force row level security;', target);
  end loop;
end $$;

-- Tablas con columna user_id: dueño directo.
do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'categories', 'subcategories', 'accounts', 'payment_methods',
    'merchants', 'receipts', 'budgets', 'goals', 'goal_contributions',
    'exchange_rates', 'categorization_rules', 'recurring_expenses',
    'ai_interactions', 'notifications'
  ] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$s;', target);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$s;', target);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$s;', target);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$s;', target);

    execute format(
      'create policy "%1$s_select_own" on public.%1$s for select using (user_id = auth.uid());', target);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$s for insert with check (user_id = auth.uid());', target);
    execute format(
      'create policy "%1$s_update_own" on public.%1$s for update using (user_id = auth.uid()) with check (user_id = auth.uid());', target);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$s for delete using (user_id = auth.uid());', target);
  end loop;
end $$;

-- Movimientos: propios o del hogar al que pertenezco.
drop policy if exists "transactions_select" on public.transactions;
create policy "transactions_select" on public.transactions
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );

drop policy if exists "transactions_insert" on public.transactions;
create policy "transactions_insert" on public.transactions
  for insert with check (
    user_id = auth.uid()
    and (household_id is null or public.is_household_member(household_id))
  );

-- Editar y borrar sólo lo propio, aunque el hogar permita verlo.
drop policy if exists "transactions_update" on public.transactions;
create policy "transactions_update" on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "transactions_delete" on public.transactions;
create policy "transactions_delete" on public.transactions
  for delete using (user_id = auth.uid());

-- Tablas hijas: heredan el permiso del padre.
drop policy if exists "transaction_items_all" on public.transaction_items;
create policy "transaction_items_all" on public.transaction_items
  for all using (public.owns_transaction(transaction_id))
  with check (public.owns_transaction(transaction_id));

drop policy if exists "receipt_items_all" on public.receipt_items;
create policy "receipt_items_all" on public.receipt_items
  for all using (public.owns_receipt(receipt_id))
  with check (public.owns_receipt(receipt_id));

drop policy if exists "budget_categories_all" on public.budget_categories;
create policy "budget_categories_all" on public.budget_categories
  for all using (public.owns_budget(budget_id))
  with check (public.owns_budget(budget_id));

-- Hogares.
drop policy if exists "households_select" on public.households;
create policy "households_select" on public.households
  for select using (owner_id = auth.uid() or public.is_household_member(id));

drop policy if exists "households_insert" on public.households;
create policy "households_insert" on public.households
  for insert with check (owner_id = auth.uid());

drop policy if exists "households_update" on public.households;
create policy "households_update" on public.households
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "households_delete" on public.households;
create policy "households_delete" on public.households
  for delete using (owner_id = auth.uid());

drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists "household_members_insert" on public.household_members;
create policy "household_members_insert" on public.household_members
  for insert with check (
    user_id = auth.uid()
    or exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
  );

drop policy if exists "household_members_delete" on public.household_members;
create policy "household_members_delete" on public.household_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
  );


-- ========================================================================
-- 20260907000004_functions.sql
-- ========================================================================

-- Crocante · funciones de negocio y de reportes
-- Las agregaciones viven en SQL: el navegador nunca descarga miles de filas para sumar.

-- ------------------------------------------------- alta de nueva cuenta

create or replace function public.seed_user_defaults(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  taxonomy jsonb := public.default_category_taxonomy();
  category jsonb;
  sub jsonb;
  new_category_id uuid;
  category_index integer := 0;
  sub_index integer;
begin
  for category in select * from jsonb_array_elements(taxonomy) loop
    insert into public.categories (user_id, name, slug, kind, icon, color, position, is_system)
    values (
      target,
      category->>'name',
      category->>'slug',
      (category->>'kind')::category_kind,
      category->>'icon',
      category->>'color',
      category_index,
      true
    )
    on conflict (user_id, slug) do update set name = excluded.name
    returning id into new_category_id;

    sub_index := 0;
    for sub in select * from jsonb_array_elements(category->'subcategories') loop
      insert into public.subcategories (category_id, user_id, name, slug, position, keywords)
      values (
        new_category_id,
        target,
        sub->>'name',
        sub->>'slug',
        sub_index,
        coalesce(array(select jsonb_array_elements_text(sub->'keywords')), '{}')
      )
      on conflict (category_id, slug) do nothing;
      sub_index := sub_index + 1;
    end loop;

    category_index := category_index + 1;
  end loop;

  insert into public.payment_methods (user_id, name, kind, is_default)
  values
    (target, 'Efectivo', 'cash', true),
    (target, 'Débito', 'debit', false),
    (target, 'Crédito', 'credit', false),
    (target, 'Transferencia', 'transfer', false),
    (target, 'Mercado Pago', 'wallet', false)
  on conflict do nothing;

  insert into public.accounts (user_id, name, currency, kind)
  values (target, 'Cuenta principal', 'ARS', 'checking')
  on conflict do nothing;

  insert into public.exchange_rates (user_id, base_currency, quote_currency, rate, source)
  values (target, 'ARS', 'USD', 1480, 'seed'), (target, 'ARS', 'EUR', 1620, 'seed')
  on conflict do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Mi cuenta')
  )
  on conflict (user_id) do nothing;

  perform public.seed_user_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene el monto acumulado de una meta al día con sus aportes.
create or replace function public.sync_goal_amount()
returns trigger
language plpgsql
as $$
begin
  update public.goals g
  set current_amount = coalesce((
    select sum(c.amount) from public.goal_contributions c where c.goal_id = g.id
  ), 0)
  where g.id = coalesce(new.goal_id, old.goal_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_goal_after_contribution on public.goal_contributions;
create trigger sync_goal_after_contribution
  after insert or update or delete on public.goal_contributions
  for each row execute function public.sync_goal_amount();

create or replace function public.reorder_categories(p_ids uuid[])
returns void
language sql
as $$
  update public.categories c
  set position = idx.position - 1
  from unnest(p_ids) with ordinality as idx(id, position)
  where c.id = idx.id and c.user_id = auth.uid();
$$;

-- ------------------------------------------------------------- reportes

create or replace function public.report_summary(p_from date, p_to date)
returns table (income numeric, expense numeric, transaction_count integer)
language sql
stable
as $$
  select
    coalesce(sum(base_amount) filter (where type in ('income', 'refund')), 0)::numeric as income,
    coalesce(sum(base_amount) filter (where type = 'expense'), 0)::numeric as expense,
    count(*)::integer as transaction_count
  from public.transactions
  where user_id = auth.uid() and transaction_date between p_from and p_to;
$$;

create or replace function public.report_by_category(p_from date, p_to date)
returns table (
  category_id uuid,
  category_name text,
  color text,
  icon text,
  amount numeric,
  transaction_count integer
)
language sql
stable
as $$
  select
    t.category_id,
    coalesce(c.name, 'Sin categoría') as category_name,
    coalesce(c.color, '#94a3b8') as color,
    coalesce(c.icon, 'Tag') as icon,
    sum(t.base_amount)::numeric as amount,
    count(*)::integer as transaction_count
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date between p_from and p_to
  group by t.category_id, c.name, c.color, c.icon
  order by amount desc;
$$;

create or replace function public.report_by_subcategory(p_from date, p_to date)
returns table (
  category_id uuid,
  category_name text,
  subcategory_id uuid,
  subcategory_name text,
  color text,
  amount numeric,
  transaction_count integer
)
language sql
stable
as $$
  select
    t.category_id,
    coalesce(c.name, 'Sin categoría') as category_name,
    t.subcategory_id,
    coalesce(s.name, 'Sin subcategoría') as subcategory_name,
    coalesce(c.color, '#94a3b8') as color,
    sum(t.base_amount)::numeric as amount,
    count(*)::integer as transaction_count
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  left join public.subcategories s on s.id = t.subcategory_id
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date between p_from and p_to
  group by t.category_id, c.name, t.subcategory_id, s.name, c.color
  order by amount desc;
$$;

create or replace function public.report_monthly(p_from date, p_to date)
returns table (month text, income numeric, expense numeric)
language sql
stable
as $$
  select
    to_char(months.month, 'YYYY-MM') as month,
    coalesce(sum(t.base_amount) filter (where t.type in ('income', 'refund')), 0)::numeric as income,
    coalesce(sum(t.base_amount) filter (where t.type = 'expense'), 0)::numeric as expense
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') as months(month)
  left join public.transactions t
    on t.user_id = auth.uid()
   and date_trunc('month', t.transaction_date) = months.month
  group by months.month
  order by months.month;
$$;

create or replace function public.report_daily(p_from date, p_to date)
returns table (day date, income numeric, expense numeric, transaction_count integer)
language sql
stable
as $$
  select
    days.day::date,
    coalesce(sum(t.base_amount) filter (where t.type in ('income', 'refund')), 0)::numeric as income,
    coalesce(sum(t.base_amount) filter (where t.type = 'expense'), 0)::numeric as expense,
    count(t.id)::integer as transaction_count
  from generate_series(p_from, p_to, interval '1 day') as days(day)
  left join public.transactions t
    on t.user_id = auth.uid() and t.transaction_date = days.day::date
  group by days.day
  order by days.day;
$$;

create or replace function public.report_merchants(p_from date, p_to date, p_limit integer default 10)
returns table (merchant text, amount numeric, transaction_count integer, last_date date)
language sql
stable
as $$
  select
    coalesce(nullif(trim(t.merchant_name), ''), t.description) as merchant,
    sum(t.base_amount)::numeric as amount,
    count(*)::integer as transaction_count,
    max(t.transaction_date) as last_date
  from public.transactions t
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date between p_from and p_to
  group by 1
  order by amount desc
  limit p_limit;
$$;

create or replace function public.report_payment_methods(p_from date, p_to date)
returns table (name text, amount numeric, transaction_count integer)
language sql
stable
as $$
  select
    coalesce(p.name, 'Sin especificar') as name,
    sum(t.base_amount)::numeric as amount,
    count(*)::integer as transaction_count
  from public.transactions t
  left join public.payment_methods p on p.id = t.payment_method_id
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date between p_from and p_to
  group by p.name
  order by amount desc;
$$;

-- Gastos hormiga: el umbral se calcula sobre el propio gasto de la persona.
create or replace function public.report_ants(p_from date, p_to date)
returns table (threshold numeric, label text, total numeric, transaction_count integer)
language sql
stable
as $$
  with scope as (
    select * from public.transactions
    where user_id = auth.uid() and type = 'expense' and transaction_date between p_from and p_to
  ),
  limits as (
    -- Percentil 35 del gasto propio: estable aunque haya pagos grandes puntuales.
    select greatest(1000, percentile_cont(0.35) within group (order by base_amount)) as threshold
    from scope
  ),
  ants as (
    select coalesce(nullif(trim(merchant_name), ''), description) as label, base_amount
    from scope, limits
    where scope.base_amount <= limits.threshold
  )
  select
    (select threshold from limits)::numeric as threshold,
    ants.label,
    sum(ants.base_amount)::numeric as total,
    count(*)::integer as transaction_count
  from ants
  group by ants.label
  having count(*) >= 2
  order by total desc
  limit 12;
$$;

create or replace function public.budget_spent(p_reference date default current_date)
returns table (budget_id uuid, spent numeric)
language sql
stable
as $$
  select
    b.id as budget_id,
    coalesce(sum(t.base_amount), 0)::numeric as spent
  from public.budgets b
  left join public.transactions t
    on t.user_id = b.user_id
   and t.type = 'expense'
   and (b.category_id is null or t.category_id = b.category_id)
   and (b.subcategory_id is null or t.subcategory_id = b.subcategory_id)
   and t.transaction_date between
       case when b.period = 'monthly' then date_trunc('month', p_reference)::date
            else (date_trunc('week', p_reference))::date end
       and
       case when b.period = 'monthly' then (date_trunc('month', p_reference) + interval '1 month - 1 day')::date
            else (date_trunc('week', p_reference) + interval '6 days')::date end
  where b.user_id = auth.uid() and b.is_active
  group by b.id;
$$;

create or replace function public.account_balance()
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case
      when type in ('income', 'refund') then base_amount
      when type = 'expense' then -base_amount
      else 0
    end
  ), 0)::numeric
  from public.transactions
  where user_id = auth.uid();
$$;

-- Detección de gastos recurrentes: mismo comercio, cadencia e importe estables.
create or replace function public.detect_recurring()
returns table (
  merchant_key text,
  label text,
  average_amount numeric,
  occurrences integer,
  avg_gap_days numeric,
  last_date date,
  category_id uuid,
  confirmed boolean
)
language sql
stable
as $$
  with scope as (
    select
      public.normalize_text(coalesce(nullif(trim(merchant_name), ''), description)) as merchant_key,
      coalesce(nullif(trim(merchant_name), ''), description) as label,
      base_amount,
      transaction_date,
      category_id
    from public.transactions
    where user_id = auth.uid() and type = 'expense'
  ),
  gaps as (
    select
      merchant_key,
      transaction_date - lag(transaction_date) over (partition by merchant_key order by transaction_date) as gap
    from scope
  ),
  stats as (
    select
      s.merchant_key,
      max(s.label) as label,
      avg(s.base_amount) as average_amount,
      stddev_pop(s.base_amount) as spread,
      count(*)::integer as occurrences,
      max(s.transaction_date) as last_date,
      mode() within group (order by s.category_id) as category_id
    from scope s
    group by s.merchant_key
    having count(*) >= 3
  ),
  cadence as (
    select merchant_key, avg(gap)::numeric as avg_gap_days
    from gaps
    where gap is not null
    group by merchant_key
  )
  select
    stats.merchant_key,
    stats.label,
    round(stats.average_amount, 2) as average_amount,
    stats.occurrences,
    round(cadence.avg_gap_days, 1) as avg_gap_days,
    stats.last_date,
    stats.category_id,
    r.confirmed
  from stats
  join cadence using (merchant_key)
  left join public.recurring_expenses r
    on r.user_id = auth.uid() and r.merchant_key = stats.merchant_key
  -- Mismas bandas de cadencia que usa el cliente: semanal, mensual, bimestral o anual.
  where (cadence.avg_gap_days between 5 and 9
      or cadence.avg_gap_days between 24 and 38
      or cadence.avg_gap_days between 50 and 75
      or cadence.avg_gap_days between 330 and 400)
    and (stats.average_amount = 0 or coalesce(stats.spread, 0) / nullif(stats.average_amount, 0) <= 0.45)
  order by average_amount desc;
$$;

-- Avisos automáticos cuando un límite llega a su umbral.
create or replace function public.check_budget_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row record;
begin
  for row in
    select b.id, b.name, b.amount, s.spent
    from public.budgets b
    join public.budget_spent(new.transaction_date) s on s.budget_id = b.id
    where b.user_id = new.user_id and b.is_active and b.amount > 0
  loop
    if row.spent >= row.amount then
      insert into public.notifications (user_id, kind, title, body, link)
      select new.user_id, 'budget_alert',
             format('Excediste el límite de %s', row.name),
             format('Llevás gastado %s de %s.', round(row.spent), round(row.amount)),
             format('%s:%s:exceeded', row.id, to_char(new.transaction_date, 'YYYY-MM'))
      where not exists (
        select 1 from public.notifications n
        where n.user_id = new.user_id
          and n.link = format('%s:%s:exceeded', row.id, to_char(new.transaction_date, 'YYYY-MM'))
      );
    elsif row.spent >= row.amount * 0.9 then
      insert into public.notifications (user_id, kind, title, body, link)
      select new.user_id, 'budget_alert',
             format('Vas por el 90%% de %s', row.name),
             format('Llevás gastado %s de %s.', round(row.spent), round(row.amount)),
             format('%s:%s:danger', row.id, to_char(new.transaction_date, 'YYYY-MM'))
      where not exists (
        select 1 from public.notifications n
        where n.user_id = new.user_id
          and n.link = format('%s:%s:danger', row.id, to_char(new.transaction_date, 'YYYY-MM'))
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists budget_alerts_after_transaction on public.transactions;
create trigger budget_alerts_after_transaction
  after insert on public.transactions
  for each row when (new.type = 'expense')
  execute function public.check_budget_alerts();

-- Sólo usuarios autenticados pueden ejecutar los reportes; cada función filtra por auth.uid().
do $$
declare
  target text;
begin
  foreach target in array array[
    'report_summary(date,date)', 'report_by_category(date,date)', 'report_by_subcategory(date,date)',
    'report_monthly(date,date)', 'report_daily(date,date)', 'report_merchants(date,date,integer)',
    'report_payment_methods(date,date)', 'report_ants(date,date)', 'budget_spent(date)',
    'account_balance()', 'detect_recurring()', 'reorder_categories(uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon;', target);
    execute format('grant execute on function public.%s to authenticated;', target);
  end loop;
end $$;


-- ========================================================================
-- 20260907000005_storage.sql
-- ========================================================================

-- Crocante · almacenamiento de tickets
-- Bucket privado: cada archivo vive bajo <user_id>/… y sólo su dueño lo alcanza.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts_read_own" on storage.objects;
create policy "receipts_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_update_own" on storage.objects;
create policy "receipts_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);


-- ========================================================================
-- 20260907000006_demo_seed.sql
-- ========================================================================

-- Crocante · datos de ejemplo
-- Genera ~200 movimientos con contexto argentino para probar reportes.
-- Uso:  select public.seed_demo_data(auth.uid());

create or replace function public.seed_demo_data(target uuid, months_back integer default 6)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pattern record;
  month_offset integer;
  month_start date;
  days_in_month integer;
  last_day integer;
  inflation numeric;
  occurrences integer;
  i integer;
  day_of_month integer;
  amount numeric;
  merchant text;
  cat_id uuid;
  sub_id uuid;
  method_id uuid;
  inserted integer := 0;
begin
  if target is null then
    raise exception 'Necesito un user_id para generar los datos de ejemplo.';
  end if;

  perform public.seed_user_defaults(target);

  create temporary table if not exists demo_patterns (
    category_slug text,
    subcategory_slug text,
    merchants text[],
    min_amount numeric,
    max_amount numeric,
    per_month numeric,
    recurring boolean,
    label text
  ) on commit drop;
  delete from demo_patterns;

  insert into demo_patterns values
    ('alimentacion','supermercado', array['Carrefour','Coto','Día%','Jumbo'], 28000, 96000, 2, false, null),
    ('alimentacion','verduleria', array['Verdulería del barrio'], 6000, 18000, 1.5, false, null),
    ('alimentacion','carniceria', array['Carnicería La Estrella'], 12000, 38000, 1, false, null),
    ('alimentacion','panaderia', array['Panadería Los Dos Hermanos'], 2500, 7000, 2, false, null),
    ('alimentacion','delivery', array['PedidosYa','Rappi'], 9000, 26000, 2, false, null),
    ('alimentacion','restaurante', array['Parrilla Don Julio','Sushi Club'], 18000, 62000, 1, false, null),
    ('alimentacion','cafe', array['Starbucks','Havanna','Café de la esquina'], 3000, 9000, 2.5, false, null),
    ('alimentacion','comida-rapida', array['McDonald''s','Mostaza'], 7000, 19000, 1, false, null),
    ('transporte','combustible', array['YPF','Shell','Axion'], 22000, 48000, 1.5, false, null),
    ('transporte','transporte-publico', array['SUBE'], 3000, 9000, 1, false, null),
    ('transporte','apps-movilidad', array['Uber','Cabify','DiDi'], 4000, 16000, 2, false, null),
    ('transporte','peajes', array['Telepase'], 1800, 4500, 1, false, null),
    ('hogar','alquiler', array['Inmobiliaria Rivas'], 450000, 450000, 1, true, 'Alquiler'),
    ('hogar','expensas', array['Consorcio'], 85000, 105000, 1, true, 'Expensas'),
    ('hogar','electricidad', array['Edesur'], 28000, 62000, 1, true, 'Factura de luz'),
    ('hogar','gas', array['Metrogas'], 12000, 39000, 1, true, 'Factura de gas'),
    ('hogar','internet', array['Fibertel'], 32000, 36000, 1, true, 'Internet'),
    ('hogar','telefonia', array['Personal'], 14000, 18000, 1, true, 'Celular'),
    ('salud','obra-social', array['OSDE'], 118000, 132000, 1, true, 'Prepaga'),
    ('salud','farmacia', array['Farmacity'], 4000, 26000, 1, false, null),
    ('entretenimiento','streaming', array['Netflix'], 9500, 9500, 1, true, 'Netflix'),
    ('entretenimiento','streaming', array['Spotify'], 5900, 5900, 1, true, 'Spotify'),
    ('entretenimiento','salidas', array['Bar Nómade'], 12000, 48000, 1, false, null),
    ('deporte','gimnasio', array['SportClub'], 28000, 32000, 1, true, 'Cuota del gym'),
    ('deporte','futbol', array['Cancha El Potrero'], 6000, 12000, 1.5, false, 'Fútbol de los jueves'),
    ('ropa','indumentaria', array['Zara','Kevingston'], 25000, 120000, 0.5, false, null),
    ('personal','cuidado-personal', array['Peluquería'], 8000, 26000, 0.5, false, null),
    ('personal','mascotas', array['Veterinaria San Roque'], 12000, 42000, 0.5, false, null),
    ('finanzas','impuestos', array['ARCA'], 32000, 68000, 1, true, 'Monotributo');

  select id into method_id from public.payment_methods where user_id = target order by is_default desc limit 1;

  for month_offset in reverse (months_back - 1)..0 loop
    month_start := date_trunc('month', current_date - (month_offset || ' months')::interval)::date;
    days_in_month := extract(day from (month_start + interval '1 month - 1 day'));
    last_day := case when month_offset = 0 then least(extract(day from current_date)::integer, days_in_month) else days_in_month end;
    inflation := 1 + (months_back - 1 - month_offset) * 0.035;

    -- Ingresos del mes.
    select c.id, s.id into cat_id, sub_id
    from public.categories c
    join public.subcategories s on s.category_id = c.id
    where c.user_id = target and c.slug = 'ingresos' and s.slug = 'sueldo';

    if last_day >= 5 then
      amount := round(((1650000 + random() * 250000) * inflation)::numeric, 2);
      insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency, exchange_rate,
        description, category_id, subcategory_id, payment_method_id, transaction_date, source)
      values (target, 'income', amount, 'ARS', amount, 'ARS', 1,
        'Sueldo', cat_id, sub_id, method_id, month_start + 4, 'seed');
      inserted := inserted + 1;
    end if;

    if last_day >= 18 then
      select c.id, s.id into cat_id, sub_id
      from public.categories c
      join public.subcategories s on s.category_id = c.id
      where c.user_id = target and c.slug = 'ingresos' and s.slug = 'freelance';

      amount := round(((180000 + random() * 340000) * inflation)::numeric, 2);
      insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency, exchange_rate,
        description, category_id, subcategory_id, payment_method_id, transaction_date, source)
      values (target, 'income', amount, 'ARS', amount, 'ARS', 1,
        'Proyecto freelance', cat_id, sub_id, method_id, month_start + 17, 'seed');
      inserted := inserted + 1;
    end if;

    -- Gastos del mes.
    for pattern in select * from demo_patterns loop
      select c.id, s.id into cat_id, sub_id
      from public.categories c
      join public.subcategories s on s.category_id = c.id
      where c.user_id = target and c.slug = pattern.category_slug and s.slug = pattern.subcategory_slug;

      if cat_id is null then
        continue;
      end if;

      if pattern.recurring then
        occurrences := 1;
      else
        occurrences := round(pattern.per_month
          * (case when month_offset = 0 then last_day::numeric / days_in_month else 1 end)
          * (0.7 + random() * 0.6)::numeric);
      end if;

      for i in 1..greatest(occurrences, 0) loop
        day_of_month := case when pattern.recurring then least(last_day, 3 + floor(random() * 5)::integer)
                             else 1 + floor(random() * last_day)::integer end;
        if day_of_month > last_day then
          continue;
        end if;

        amount := round(((pattern.min_amount + random() * (pattern.max_amount - pattern.min_amount)) * inflation)::numeric, 2);
        merchant := pattern.merchants[1 + floor(random() * array_length(pattern.merchants, 1))::integer];

        insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency, exchange_rate,
          description, merchant_name, category_id, subcategory_id, payment_method_id, transaction_date, source)
        values (target, 'expense', amount, 'ARS', amount, 'ARS', 1,
          coalesce(pattern.label, merchant), merchant, cat_id, sub_id, method_id,
          month_start + (day_of_month - 1), 'seed');
        inserted := inserted + 1;
      end loop;
    end loop;
  end loop;

  -- Un par de movimientos en dólares para ver el multimoneda funcionando.
  select c.id, s.id into cat_id, sub_id
  from public.categories c
  join public.subcategories s on s.category_id = c.id
  where c.user_id = target and c.slug = 'inversiones' and s.slug = 'dolar';

  insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency, exchange_rate,
    description, category_id, subcategory_id, payment_method_id, transaction_date, source)
  values (target, 'expense', 200, 'USD', 296000, 'ARS', 1480,
    'Compra de dólares', cat_id, sub_id, method_id, current_date - 30, 'manual');
  inserted := inserted + 1;

  -- Límites y metas de ejemplo.
  insert into public.budgets (user_id, name, period, amount, currency, category_id)
  select target, 'Alimentación', 'monthly', 400000, 'ARS', c.id
  from public.categories c where c.user_id = target and c.slug = 'alimentacion'
  on conflict do nothing;

  insert into public.budgets (user_id, name, period, amount, currency, category_id)
  values (target, 'Gasto total del mes', 'monthly', 1600000, 'ARS', null)
  on conflict do nothing;

  insert into public.goals (user_id, name, description, target_amount, current_amount, currency, target_date, monthly_contribution)
  values
    (target, 'Vacaciones', 'Costa atlántica en enero', 2000000, 850000, 'ARS', current_date + 150, 250000),
    (target, 'Fondo de emergencia', 'Tres meses de gastos', 3600000, 1150000, 'ARS', current_date + 330, 200000)
  on conflict do nothing;

  return inserted;
end;
$$;

revoke all on function public.seed_demo_data(uuid, integer) from public, anon;
grant execute on function public.seed_demo_data(uuid, integer) to authenticated;


-- ========================================================================
-- 20260908000001_household_members.sql
-- ========================================================================

-- Modo hogar / pareja
--
-- Una persona del hogar puede no tener cuenta en Crocante (mi pareja no usa la app,
-- pero paga la mitad del supermercado). Por eso los miembros existen por sí mismos y
-- el vínculo con una cuenta es opcional, y por eso "quién pagó" apunta al miembro.

alter table public.household_members
  alter column user_id drop not null,
  add column if not exists invite_email text,
  add column if not exists color text not null default '#2f9e8f',
  add column if not exists is_active boolean not null default true;

-- Un mismo usuario no puede estar dos veces en el hogar, pero sí puede haber varios
-- miembros sin cuenta asociada: un índice único parcial permite varios NULL.
alter table public.household_members
  drop constraint if exists household_members_household_id_user_id_key;

create unique index if not exists household_members_unique_account
  on public.household_members (household_id, user_id)
  where user_id is not null;

-- "Pagado por" pasa a referirse al miembro del hogar, no a una cuenta.
alter table public.transactions
  drop constraint if exists transactions_paid_by_fkey;

alter table public.transactions
  add constraint transactions_paid_by_fkey
    foreign key (paid_by) references public.household_members(id) on delete set null;

create index if not exists household_members_household_idx on public.household_members (household_id);
create index if not exists transactions_paid_by_idx on public.transactions (paid_by) where paid_by is not null;

-- El dueño del hogar administra los miembros; cada quien se ve a sí mismo.
drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists "household_members_insert" on public.household_members;
create policy "household_members_insert" on public.household_members
  for insert with check (
    exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists "household_members_update" on public.household_members;
create policy "household_members_update" on public.household_members
  for update using (
    exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
  );

/**
 * Balance del hogar en un período.
 *
 * Devuelve, por miembro: cuánto puso y cuánto le correspondía según su parte.
 * Un balance positivo significa que puso de más y el resto le debe.
 */
create or replace function public.household_balance(p_household uuid, p_from date, p_to date)
returns table (
  member_id uuid,
  display_name text,
  color text,
  share numeric,
  paid numeric,
  owed numeric,
  balance numeric
)
language sql
stable
as $$
  with members as (
    select m.id, m.display_name, m.color, m.share
    from public.household_members m
    where m.household_id = p_household and m.is_active
  ),
  scope as (
    select t.paid_by, t.base_amount
    from public.transactions t
    where t.household_id = p_household
      and t.type = 'expense'
      and t.transaction_date between p_from and p_to
  ),
  totals as (
    select coalesce(sum(base_amount), 0) as total from scope
  ),
  shares as (
    select coalesce(nullif(sum(share), 0), 1) as total_share from members
  )
  select
    m.id as member_id,
    m.display_name,
    m.color,
    round(m.share / shares.total_share, 4) as share,
    coalesce((select sum(s.base_amount) from scope s where s.paid_by = m.id), 0)::numeric as paid,
    round(totals.total * (m.share / shares.total_share), 2) as owed,
    round(
      coalesce((select sum(s.base_amount) from scope s where s.paid_by = m.id), 0)
      - totals.total * (m.share / shares.total_share),
      2
    ) as balance
  from members m, totals, shares
  order by paid desc;
$$;

revoke all on function public.household_balance(uuid, date, date) from public, anon;
grant execute on function public.household_balance(uuid, date, date) to authenticated;
