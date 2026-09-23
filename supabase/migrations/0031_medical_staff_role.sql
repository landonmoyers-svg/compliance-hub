-- Medical staff: providers, MAs and nurses.
--
-- "staff" had been doing two jobs. It held the front desk and the billers, and
-- it also held the people who draw up ketamine and keep the vial log — so any
-- permission given to the clinical half was handed to everyone else as well.
-- This splits the clinical half out so it can be granted things like filing a
-- controlled-substance log without that reaching reception.
--
-- Nobody is moved. Existing staff accounts stay 'staff'; an owner reassigns the
-- clinical ones in User Management. Guessing which of them are nurses from a
-- job title is exactly the kind of inference that gets access control wrong.
--
-- The RLS helpers need no change: is_privileged(), owner_or_admin(),
-- clinical_admin_or_owner() and the rest are allow-lists that medical_staff is
-- correctly absent from, and is_writer() is a deny-list of read_only/inactive,
-- so medical staff can write exactly as staff always could.

alter table public.profiles drop constraint if exists profiles_account_role_check;

alter table public.profiles add constraint profiles_account_role_check
  check (account_role = any (array[
    'owner', 'admin', 'hr', 'clinical_leadership', 'manager',
    'medical_staff',
    'staff', 'contractor', 'read_only', 'inactive'
  ]));
