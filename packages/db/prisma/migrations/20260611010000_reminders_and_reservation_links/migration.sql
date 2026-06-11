-- Lembretes automáticos + ficha vinculada à reserva

CREATE TYPE "ReminderType" AS ENUM ('checkin_tomorrow', 'post_checkout');

ALTER TABLE guest_registration_links ADD COLUMN reservation_id UUID;
ALTER TABLE guest_registration_links ADD COLUMN reminder_sent_at TIMESTAMP(3);
ALTER TABLE guest_registration_links ADD CONSTRAINT guest_registration_links_reservation_id_fkey
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE reservation_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  reservation_id UUID NOT NULL,
  type "ReminderType" NOT NULL,
  sent_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT reservation_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT reservation_reminders_reservation_id_fkey FOREIGN KEY (reservation_id)
    REFERENCES reservations(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX reservation_reminders_reservation_id_type_key ON reservation_reminders(reservation_id, type);
CREATE INDEX reservation_reminders_tenant_id_idx ON reservation_reminders(tenant_id);

ALTER TABLE reservation_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservation_reminders_tenant ON reservation_reminders
  USING (tenant_id = app_current_tenant());
