-- ============================================================================
-- SuryaBooker - database schema (MySQL 8.0)
--
-- Derived from the front end in frontend/src. Every table here backs something
-- the UI already renders; each section names the type file it mirrors.
--
-- Requires MySQL 8.0.16 or later, which is the first version that actually
-- enforces CHECK constraints rather than parsing and ignoring them.
--
-- Run with:
--   mysql -u root -p --default-character-set=utf8mb4 < schema.sql
--
-- Conventions:
--   * Surrogate keys are BIGINT UNSIGNED AUTO_INCREMENT; every foreign key
--     column matches that type exactly, which InnoDB requires.
--   * Money is DECIMAL(10, 2) in rupees - never FLOAT, which cannot hold
--     decimal fractions exactly.
--   * Clock times are CHAR(5) 'HH:MM' because the front end treats them as
--     wall-clock strings on a schedule, not as instants.
--   * Status and kind columns are VARCHAR + CHECK rather than ENUM, which is
--     painful to alter once rows exist.
--   * InnoDB and utf8mb4 throughout, so Indian-language names and emoji are
--     stored correctly.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS suryabooker
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE suryabooker;


-- ============================================================================
-- 1. Shared reference data
-- ============================================================================

-- Mirrors CITIES in frontend/src/constants/index.ts.
CREATE TABLE city (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name       VARCHAR(120)    NOT NULL,
    state      VARCHAR(120)    NULL,
    is_active  BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_city_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 2. Accounts - mirrors frontend/src/components/AuthModal.tsx
-- ============================================================================

CREATE TABLE app_user (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    full_name      VARCHAR(150)    NOT NULL,
    email          VARCHAR(254)    NOT NULL,
    phone          VARCHAR(15)     NULL,
    -- Never store the password itself; this holds the hash Django produces.
    password_hash  VARCHAR(255)    NOT NULL,
    is_active      BOOLEAN         NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN         NOT NULL DEFAULT FALSE,
    phone_verified BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at  DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_email (email),
    UNIQUE KEY uq_user_phone (phone),
    CONSTRAINT ck_user_phone
        CHECK (phone IS NULL OR CHAR_LENGTH(phone) = 10)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Travellers a signed-in user reuses across bookings ("saved travellers" in
-- the auth modal copy).
CREATE TABLE saved_traveller (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NOT NULL,
    full_name     VARCHAR(150)    NOT NULL,
    age           SMALLINT        NULL,
    gender        VARCHAR(10)     NULL,
    date_of_birth DATE            NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_saved_traveller_user (user_id),
    CONSTRAINT fk_saved_traveller_user
        FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
    CONSTRAINT ck_saved_traveller_gender
        CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 3. Offers - mirrors OFFERS in frontend/src/constants/index.ts
-- ============================================================================

CREATE TABLE offer (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code               VARCHAR(32)     NOT NULL,
    title              VARCHAR(200)    NOT NULL,
    description        VARCHAR(500)    NULL,
    -- Which mode the code applies to; NULL means every mode.
    applies_to_mode    VARCHAR(10)     NULL,
    discount_type      VARCHAR(10)     NOT NULL DEFAULT 'percent',
    discount_value     DECIMAL(10, 2)  NOT NULL,
    max_discount       DECIMAL(10, 2)  NULL,
    min_booking_amount DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    valid_from         DATE            NULL,
    valid_to           DATE            NULL,
    is_active          BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_offer_code (code),
    CONSTRAINT ck_offer_mode
        CHECK (applies_to_mode IS NULL
               OR applies_to_mode IN ('bus', 'train', 'plane', 'hotel', 'cab')),
    CONSTRAINT ck_offer_discount_type
        CHECK (discount_type IN ('percent', 'flat')),
    CONSTRAINT ck_offer_window
        CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 4. Bus - mirrors frontend/src/types/bus.types.ts
-- ============================================================================

CREATE TABLE bus_operator (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(150)    NOT NULL,
    rating       DECIMAL(2, 1)   NULL,
    rating_count INT UNSIGNED    NOT NULL DEFAULT 0,
    is_active    BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bus_operator_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE bus_amenity (
    id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100)    NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bus_amenity_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- A scheduled service. One row is a route plus timetable, not a single day's
-- run; the date lives on the booking.
CREATE TABLE bus_trip (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    operator_id         BIGINT UNSIGNED NOT NULL,
    coach_name          VARCHAR(150)    NOT NULL,
    seat_kind           VARCHAR(10)     NOT NULL,
    is_air_conditioned  BOOLEAN         NOT NULL DEFAULT TRUE,
    -- Seat arrangement per row, e.g. '2+1'.
    layout              VARCHAR(10)     NOT NULL,
    origin_city_id      BIGINT UNSIGNED NOT NULL,
    destination_city_id BIGINT UNSIGNED NOT NULL,
    departure_time      CHAR(5)         NOT NULL,
    arrival_time        CHAR(5)         NOT NULL,
    duration_minutes    INT UNSIGNED    NOT NULL,
    arrives_next_day    BOOLEAN         NOT NULL DEFAULT FALSE,
    base_fare           DECIMAL(10, 2)  NOT NULL,
    cancellation_policy VARCHAR(500)    NULL,
    has_live_tracking   BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    KEY idx_bus_trip_operator (operator_id),
    KEY idx_bus_trip_route
        (origin_city_id, destination_city_id, departure_time),
    KEY idx_bus_trip_destination (destination_city_id),
    CONSTRAINT fk_bus_trip_operator
        FOREIGN KEY (operator_id) REFERENCES bus_operator (id),
    CONSTRAINT fk_bus_trip_origin
        FOREIGN KEY (origin_city_id) REFERENCES city (id),
    CONSTRAINT fk_bus_trip_destination
        FOREIGN KEY (destination_city_id) REFERENCES city (id),
    CONSTRAINT ck_bus_trip_seat_kind
        CHECK (seat_kind IN ('seater', 'sleeper')),
    CONSTRAINT ck_bus_trip_route
        CHECK (origin_city_id <> destination_city_id),
    CONSTRAINT ck_bus_trip_duration
        CHECK (duration_minutes > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE bus_trip_amenity (
    trip_id    BIGINT UNSIGNED NOT NULL,
    amenity_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (trip_id, amenity_id),
    KEY idx_bus_trip_amenity_amenity (amenity_id),
    CONSTRAINT fk_bus_trip_amenity_trip
        FOREIGN KEY (trip_id) REFERENCES bus_trip (id) ON DELETE CASCADE,
    CONSTRAINT fk_bus_trip_amenity_amenity
        FOREIGN KEY (amenity_id) REFERENCES bus_amenity (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Boarding and dropping points, kept in one table and told apart by `kind`.
CREATE TABLE bus_stop_point (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    trip_id    BIGINT UNSIGNED NOT NULL,
    kind       VARCHAR(10)     NOT NULL,
    name       VARCHAR(200)    NOT NULL,
    landmark   VARCHAR(200)    NULL,
    stop_time  CHAR(5)         NOT NULL,
    sort_order SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_bus_stop_point_trip (trip_id, kind, sort_order),
    CONSTRAINT fk_bus_stop_point_trip
        FOREIGN KEY (trip_id) REFERENCES bus_trip (id) ON DELETE CASCADE,
    CONSTRAINT ck_bus_stop_point_kind
        CHECK (kind IN ('boarding', 'dropping'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- The seat map. `status` is the seat's standing sale state; whether it is
-- taken on a given date comes from bus_booking_seat.
CREATE TABLE bus_seat (
    id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    trip_id   BIGINT UNSIGNED NOT NULL,
    seat_code VARCHAR(10)     NOT NULL,
    deck      VARCHAR(10)     NOT NULL,
    row_no    SMALLINT        NOT NULL,
    column_no SMALLINT        NOT NULL,
    seat_kind VARCHAR(10)     NOT NULL,
    -- 'ladies' seats are reservable only by a female passenger.
    status    VARCHAR(10)     NOT NULL DEFAULT 'available',
    price     DECIMAL(10, 2)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bus_seat (trip_id, seat_code),
    CONSTRAINT fk_bus_seat_trip
        FOREIGN KEY (trip_id) REFERENCES bus_trip (id) ON DELETE CASCADE,
    CONSTRAINT ck_bus_seat_deck
        CHECK (deck IN ('lower', 'upper')),
    CONSTRAINT ck_bus_seat_kind
        CHECK (seat_kind IN ('seater', 'sleeper')),
    CONSTRAINT ck_bus_seat_status
        CHECK (status IN ('available', 'blocked', 'ladies'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 5. Train - mirrors frontend/src/types/train.types.ts
-- ============================================================================

CREATE TABLE train_station (
    id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code    VARCHAR(10)     NOT NULL,
    name    VARCHAR(150)    NOT NULL,
    city_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_train_station_code (code),
    KEY idx_train_station_city (city_id),
    CONSTRAINT fk_train_station_city
        FOREIGN KEY (city_id) REFERENCES city (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE train_class (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code               VARCHAR(10)     NOT NULL,
    label              VARCHAR(100)    NOT NULL,
    -- Air-conditioned classes attract GST; the others do not.
    is_air_conditioned BOOLEAN         NOT NULL DEFAULT FALSE,
    reservation_charge DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    sort_order         SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_train_class_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE train_quota (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code              VARCHAR(20)     NOT NULL,
    label             VARCHAR(100)    NOT NULL,
    note              VARCHAR(300)    NULL,
    -- Tatkal carries a premium; the rest are priced as general.
    surcharge_percent DECIMAL(5, 2)   NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id),
    UNIQUE KEY uq_train_quota_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE train (
    id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    number                 VARCHAR(10)     NOT NULL,
    name                   VARCHAR(150)    NOT NULL,
    origin_station_id      BIGINT UNSIGNED NOT NULL,
    destination_station_id BIGINT UNSIGNED NOT NULL,
    departure_time         CHAR(5)         NOT NULL,
    arrival_time           CHAR(5)         NOT NULL,
    duration_minutes       INT UNSIGNED    NOT NULL,
    -- Nights on board; 0 means it arrives the same day.
    days_to_arrive         TINYINT         NOT NULL DEFAULT 0,
    has_pantry             BOOLEAN         NOT NULL DEFAULT FALSE,
    rating                 DECIMAL(2, 1)   NULL,
    -- Running days, Monday first.
    runs_mon               BOOLEAN         NOT NULL DEFAULT TRUE,
    runs_tue               BOOLEAN         NOT NULL DEFAULT TRUE,
    runs_wed               BOOLEAN         NOT NULL DEFAULT TRUE,
    runs_thu               BOOLEAN         NOT NULL DEFAULT TRUE,
    runs_fri               BOOLEAN         NOT NULL DEFAULT TRUE,
    runs_sat               BOOLEAN         NOT NULL DEFAULT TRUE,
    runs_sun               BOOLEAN         NOT NULL DEFAULT TRUE,
    cancellation_policy    VARCHAR(500)    NULL,
    is_active              BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_train_number (number),
    KEY idx_train_route
        (origin_station_id, destination_station_id, departure_time),
    KEY idx_train_destination (destination_station_id),
    CONSTRAINT fk_train_origin
        FOREIGN KEY (origin_station_id) REFERENCES train_station (id),
    CONSTRAINT fk_train_destination
        FOREIGN KEY (destination_station_id) REFERENCES train_station (id),
    CONSTRAINT ck_train_route
        CHECK (origin_station_id <> destination_station_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Intermediate stations a passenger may board at instead of the origin.
CREATE TABLE train_boarding_station (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    train_id       BIGINT UNSIGNED NOT NULL,
    station_id     BIGINT UNSIGNED NOT NULL,
    departure_time CHAR(5)         NOT NULL,
    day_offset     TINYINT         NOT NULL DEFAULT 0,
    sort_order     SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_train_boarding (train_id, station_id),
    KEY idx_train_boarding_station (station_id),
    CONSTRAINT fk_train_boarding_train
        FOREIGN KEY (train_id) REFERENCES train (id) ON DELETE CASCADE,
    CONSTRAINT fk_train_boarding_station
        FOREIGN KEY (station_id) REFERENCES train_station (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Fare and live availability, which vary by date and quota - this is the
-- table the search results read from.
CREATE TABLE train_availability (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    train_id           BIGINT UNSIGNED NOT NULL,
    class_id           BIGINT UNSIGNED NOT NULL,
    quota_id           BIGINT UNSIGNED NOT NULL,
    travel_date        DATE            NOT NULL,
    fare               DECIMAL(10, 2)  NOT NULL,
    availability_kind  VARCHAR(15)     NOT NULL,
    -- Seats free, or the RAC/waitlist position.
    availability_count INT             NOT NULL DEFAULT 0,
    -- What the railways print, e.g. 'AVAILABLE-0042', 'RAC 12', 'GNWL 25'.
    availability_label VARCHAR(30)     NOT NULL,
    confirm_chance     TINYINT         NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_train_availability
        (train_id, class_id, quota_id, travel_date),
    KEY idx_train_availability_lookup (travel_date, class_id, quota_id),
    KEY idx_train_availability_quota (quota_id),
    CONSTRAINT fk_train_availability_train
        FOREIGN KEY (train_id) REFERENCES train (id) ON DELETE CASCADE,
    CONSTRAINT fk_train_availability_class
        FOREIGN KEY (class_id) REFERENCES train_class (id),
    CONSTRAINT fk_train_availability_quota
        FOREIGN KEY (quota_id) REFERENCES train_quota (id),
    CONSTRAINT ck_train_availability_kind
        CHECK (availability_kind IN
               ('available', 'rac', 'waitlist', 'unavailable')),
    CONSTRAINT ck_train_confirm_chance
        CHECK (confirm_chance BETWEEN 0 AND 100)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 6. Flight - mirrors frontend/src/types/plane.types.ts
-- ============================================================================

CREATE TABLE airline (
    id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    -- Two-character carrier code, e.g. '6E'.
    code      VARCHAR(5)      NOT NULL,
    name      VARCHAR(150)    NOT NULL,
    is_active BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_airline_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE airport (
    id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    -- IATA code, e.g. 'BOM'.
    code    VARCHAR(5)      NOT NULL,
    name    VARCHAR(150)    NOT NULL,
    city_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_airport_code (code),
    KEY idx_airport_city (city_id),
    CONSTRAINT fk_airport_city
        FOREIGN KEY (city_id) REFERENCES city (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE flight (
    id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    airline_id             BIGINT UNSIGNED NOT NULL,
    flight_number          VARCHAR(10)     NOT NULL,
    aircraft               VARCHAR(120)    NULL,
    origin_airport_id      BIGINT UNSIGNED NOT NULL,
    origin_terminal        VARCHAR(10)     NULL,
    destination_airport_id BIGINT UNSIGNED NOT NULL,
    destination_terminal   VARCHAR(10)     NULL,
    departure_time         CHAR(5)         NOT NULL,
    arrival_time           CHAR(5)         NOT NULL,
    duration_minutes       INT UNSIGNED    NOT NULL,
    days_to_arrive         TINYINT         NOT NULL DEFAULT 0,
    cabin_class            VARCHAR(10)     NOT NULL DEFAULT 'economy',
    on_time_percent        TINYINT         NULL,
    is_active              BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_flight (airline_id, flight_number),
    KEY idx_flight_route
        (origin_airport_id, destination_airport_id, departure_time),
    KEY idx_flight_destination (destination_airport_id),
    CONSTRAINT fk_flight_airline
        FOREIGN KEY (airline_id) REFERENCES airline (id),
    CONSTRAINT fk_flight_origin
        FOREIGN KEY (origin_airport_id) REFERENCES airport (id),
    CONSTRAINT fk_flight_destination
        FOREIGN KEY (destination_airport_id) REFERENCES airport (id),
    CONSTRAINT ck_flight_cabin
        CHECK (cabin_class IN ('economy', 'premium', 'business')),
    CONSTRAINT ck_flight_on_time
        CHECK (on_time_percent IS NULL OR on_time_percent BETWEEN 0 AND 100),
    CONSTRAINT ck_flight_route
        CHECK (origin_airport_id <> destination_airport_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- No rows for a non-stop flight; one row per intermediate stop.
CREATE TABLE flight_stop (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    flight_id       BIGINT UNSIGNED NOT NULL,
    airport_id      BIGINT UNSIGNED NOT NULL,
    layover_minutes INT UNSIGNED    NOT NULL,
    sort_order      SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_flight_stop_flight (flight_id, sort_order),
    KEY idx_flight_stop_airport (airport_id),
    CONSTRAINT fk_flight_stop_flight
        FOREIGN KEY (flight_id) REFERENCES flight (id) ON DELETE CASCADE,
    CONSTRAINT fk_flight_stop_airport
        FOREIGN KEY (airport_id) REFERENCES airport (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Fare families: the same seat sold under different baggage and change rules.
CREATE TABLE fare_brand (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    flight_id           BIGINT UNSIGNED NOT NULL,
    code                VARCHAR(20)     NOT NULL,
    name                VARCHAR(100)    NOT NULL,
    price               DECIMAL(10, 2)  NOT NULL,
    cabin_baggage_kg    SMALLINT        NOT NULL DEFAULT 7,
    checkin_baggage_kg  SMALLINT        NOT NULL DEFAULT 15,
    cancellation_note   VARCHAR(200)    NULL,
    -- How favourable each rule is, worst to best.
    cancellation_tier   VARCHAR(10)     NOT NULL DEFAULT 'fee',
    date_change_note    VARCHAR(200)    NULL,
    date_change_tier    VARCHAR(10)     NOT NULL DEFAULT 'fee',
    free_seat_selection BOOLEAN         NOT NULL DEFAULT FALSE,
    meal_included       BOOLEAN         NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_fare_brand (flight_id, code),
    CONSTRAINT fk_fare_brand_flight
        FOREIGN KEY (flight_id) REFERENCES flight (id) ON DELETE CASCADE,
    CONSTRAINT ck_fare_brand_code
        CHECK (code IN ('saver', 'comfort', 'flexi')),
    CONSTRAINT ck_fare_brand_cancellation_tier
        CHECK (cancellation_tier IN ('fee', 'reduced', 'free')),
    CONSTRAINT ck_fare_brand_date_change_tier
        CHECK (date_change_tier IN ('fee', 'reduced', 'free'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE flight_seat (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    flight_id   BIGINT UNSIGNED NOT NULL,
    -- e.g. '12A'.
    seat_code   VARCHAR(10)     NOT NULL,
    row_no      SMALLINT        NOT NULL,
    seat_column CHAR(1)         NOT NULL,
    zone        VARCHAR(20)     NOT NULL DEFAULT 'standard',
    -- Zero means the seat is free to pick.
    price       DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    is_window   BOOLEAN         NOT NULL DEFAULT FALSE,
    is_aisle    BOOLEAN         NOT NULL DEFAULT FALSE,
    is_exit_row BOOLEAN         NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_flight_seat (flight_id, seat_code),
    CONSTRAINT fk_flight_seat_flight
        FOREIGN KEY (flight_id) REFERENCES flight (id) ON DELETE CASCADE,
    CONSTRAINT ck_flight_seat_zone
        CHECK (zone IN ('front', 'extra-legroom', 'standard'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Mirrors ADD_ONS in frontend/src/services/plane.services.ts.
CREATE TABLE flight_addon (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code        VARCHAR(20)     NOT NULL,
    label       VARCHAR(150)    NOT NULL,
    description VARCHAR(300)    NULL,
    -- Charged once per traveller.
    price       DECIMAL(10, 2)  NOT NULL,
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_flight_addon_code (code),
    CONSTRAINT ck_flight_addon_code
        CHECK (code IN ('meal', 'baggage', 'priority'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 7. Hotel - mirrors frontend/src/types/hotel.types.ts
-- ============================================================================

CREATE TABLE hotel_amenity (
    id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100)    NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_hotel_amenity_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE property (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(200)    NOT NULL,
    property_type VARCHAR(20)     NOT NULL,
    -- 0 for hostels and homestays, which are not star rated.
    star_rating   TINYINT         NOT NULL DEFAULT 0,
    locality      VARCHAR(150)    NULL,
    city_id       BIGINT UNSIGNED NOT NULL,
    address       VARCHAR(500)    NULL,
    distance_km   DECIMAL(5, 1)   NULL,
    -- Out of 10, the usual convention for stays.
    review_score  DECIMAL(3, 1)   NULL,
    review_count  INT UNSIGNED    NOT NULL DEFAULT 0,
    checkin_time  CHAR(5)         NOT NULL DEFAULT '14:00',
    checkout_time CHAR(5)         NOT NULL DEFAULT '11:00',
    is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_property_name_city (name, city_id),
    KEY idx_property_city (city_id, is_active),
    CONSTRAINT fk_property_city
        FOREIGN KEY (city_id) REFERENCES city (id),
    CONSTRAINT ck_property_type
        CHECK (property_type IN
               ('Hotel', 'Resort', 'Homestay', 'Hostel', 'Apartment')),
    CONSTRAINT ck_property_stars
        CHECK (star_rating BETWEEN 0 AND 5),
    CONSTRAINT ck_property_score
        CHECK (review_score IS NULL OR review_score BETWEEN 0 AND 10)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE property_amenity (
    property_id BIGINT UNSIGNED NOT NULL,
    amenity_id  BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (property_id, amenity_id),
    KEY idx_property_amenity_amenity (amenity_id),
    CONSTRAINT fk_property_amenity_property
        FOREIGN KEY (property_id) REFERENCES property (id) ON DELETE CASCADE,
    CONSTRAINT fk_property_amenity_amenity
        FOREIGN KEY (amenity_id) REFERENCES hotel_amenity (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE room_type (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    property_id BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(150)    NOT NULL,
    size_sqft   SMALLINT        NULL,
    bed_type    VARCHAR(10)     NULL,
    max_guests  TINYINT         NOT NULL DEFAULT 2,
    rooms_total SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_room_type (property_id, name),
    CONSTRAINT fk_room_type_property
        FOREIGN KEY (property_id) REFERENCES property (id) ON DELETE CASCADE,
    CONSTRAINT ck_room_type_bed
        CHECK (bed_type IS NULL OR bed_type IN
               ('Single', 'Twin', 'Double', 'Queen', 'King')),
    CONSTRAINT ck_room_type_guests
        CHECK (max_guests > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE room_type_amenity (
    room_type_id BIGINT UNSIGNED NOT NULL,
    amenity_id   BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (room_type_id, amenity_id),
    KEY idx_room_type_amenity_amenity (amenity_id),
    CONSTRAINT fk_room_type_amenity_room
        FOREIGN KEY (room_type_id) REFERENCES room_type (id) ON DELETE CASCADE,
    CONSTRAINT fk_room_type_amenity_amenity
        FOREIGN KEY (amenity_id) REFERENCES hotel_amenity (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- The same room sold under different terms. Not every property offers a
-- flexible plan, which is what makes the free-cancellation filter meaningful.
CREATE TABLE rate_plan (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    room_type_id       BIGINT UNSIGNED NOT NULL,
    code               VARCHAR(20)     NOT NULL,
    name               VARCHAR(150)    NOT NULL,
    price_per_night    DECIMAL(10, 2)  NOT NULL,
    breakfast_included BOOLEAN         NOT NULL DEFAULT FALSE,
    free_cancellation  BOOLEAN         NOT NULL DEFAULT FALSE,
    cancellation_note  VARCHAR(200)    NULL,
    pay_at_hotel       BOOLEAN         NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_rate_plan (room_type_id, code),
    CONSTRAINT fk_rate_plan_room
        FOREIGN KEY (room_type_id) REFERENCES room_type (id) ON DELETE CASCADE,
    CONSTRAINT ck_rate_plan_code
        CHECK (code IN ('room-only', 'breakfast', 'flexible'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Rooms free per night, so a stay spanning several nights can be checked.
CREATE TABLE room_inventory (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    room_type_id    BIGINT UNSIGNED NOT NULL,
    stay_date       DATE            NOT NULL,
    rooms_available SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_room_inventory (room_type_id, stay_date),
    KEY idx_room_inventory_date (stay_date),
    CONSTRAINT fk_room_inventory_room
        FOREIGN KEY (room_type_id) REFERENCES room_type (id) ON DELETE CASCADE,
    CONSTRAINT ck_room_inventory_available
        CHECK (rooms_available >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 8. Cab - mirrors frontend/src/types/cab.types.ts
-- ============================================================================

CREATE TABLE cab_category (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code               VARCHAR(20)     NOT NULL,
    name               VARCHAR(100)    NOT NULL,
    -- Representative models, e.g. 'Swift Dzire, Etios or similar'.
    models             VARCHAR(200)    NULL,
    seats              TINYINT         NOT NULL DEFAULT 4,
    luggage            TINYINT         NOT NULL DEFAULT 2,
    is_air_conditioned BOOLEAN         NOT NULL DEFAULT TRUE,
    rating             DECIMAL(2, 1)   NULL,
    is_active          BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cab_category_code (code),
    CONSTRAINT ck_cab_category_code
        CHECK (code IN ('hatchback', 'sedan', 'suv', 'premium'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Pricing varies by category and by what kind of journey it is.
CREATE TABLE cab_rate_card (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_id       BIGINT UNSIGNED NOT NULL,
    trip_type         VARCHAR(20)     NOT NULL,
    per_km_rate       DECIMAL(10, 2)  NOT NULL,
    minimum_km        SMALLINT        NOT NULL DEFAULT 100,
    extra_km_rate     DECIMAL(10, 2)  NOT NULL,
    -- Paid to the driver on trips that keep him overnight.
    driver_allowance  DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    night_charge      DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    cancellation_note VARCHAR(200)    NULL,
    valid_from        DATE            NULL,
    valid_to          DATE            NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cab_rate_card (category_id, trip_type, valid_from),
    KEY idx_cab_rate_card_lookup (category_id, trip_type),
    CONSTRAINT fk_cab_rate_card_category
        FOREIGN KEY (category_id) REFERENCES cab_category (id) ON DELETE CASCADE,
    CONSTRAINT ck_cab_rate_card_trip_type
        CHECK (trip_type IN ('outstation', 'airport', 'local'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Mirrors CAB_EXTRAS in frontend/src/services/cab.services.ts.
CREATE TABLE cab_extra (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code        VARCHAR(20)     NOT NULL,
    label       VARCHAR(150)    NOT NULL,
    description VARCHAR(300)    NULL,
    price       DECIMAL(10, 2)  NOT NULL,
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cab_extra_code (code),
    CONSTRAINT ck_cab_extra_code
        CHECK (code IN ('carrier', 'childSeat', 'extraStop'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 9. Bookings
--
-- One supertype row per booking carries what every mode shares - reference,
-- contact, status, total. A matching row in exactly one of the five detail
-- tables below carries the rest. This mirrors the front end, where the payment
-- step and the fare summary are shared components and only the middle steps
-- differ by mode.
-- ============================================================================

CREATE TABLE booking (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    -- What the ticket prints: 'SBG28T5X' (bus), a 10-digit PNR (train),
    -- 'S7YH3U' (flight), 'HTN75YLS' (hotel), 'CBCMBFRE' (cab).
    reference       VARCHAR(20)     NOT NULL,
    mode            VARCHAR(10)     NOT NULL,
    -- NULL for a guest checkout.
    user_id         BIGINT UNSIGNED NULL,
    status          VARCHAR(15)     NOT NULL DEFAULT 'pending',
    contact_email   VARCHAR(254)    NOT NULL,
    contact_phone   VARCHAR(15)     NOT NULL,
    offer_id        BIGINT UNSIGNED NULL,
    discount_amount DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    total_amount    DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    currency        CHAR(3)         NOT NULL DEFAULT 'INR',
    booked_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at    DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_booking_reference (reference),
    KEY idx_booking_user (user_id, booked_at),
    KEY idx_booking_mode (mode, status),
    KEY idx_booking_offer (offer_id),
    CONSTRAINT fk_booking_user
        FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT fk_booking_offer
        FOREIGN KEY (offer_id) REFERENCES offer (id) ON DELETE SET NULL,
    CONSTRAINT ck_booking_mode
        CHECK (mode IN ('bus', 'train', 'plane', 'hotel', 'cab')),
    CONSTRAINT ck_booking_status
        CHECK (status IN
               ('pending', 'confirmed', 'cancelled', 'completed', 'failed')),
    CONSTRAINT ck_booking_total
        CHECK (total_amount >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- The fare breakdown as shown in the summary card, one row per visible line.
CREATE TABLE booking_fare_line (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id BIGINT UNSIGNED NOT NULL,
    label      VARCHAR(150)    NOT NULL,
    amount     DECIMAL(10, 2)  NOT NULL,
    sort_order SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_booking_fare_line_booking (booking_id, sort_order),
    CONSTRAINT fk_booking_fare_line_booking
        FOREIGN KEY (booking_id) REFERENCES booking (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE payment (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id      BIGINT UNSIGNED NOT NULL,
    method          VARCHAR(15)     NOT NULL,
    -- Bank or wallet chosen, or the UPI handle used.
    instrument      VARCHAR(100)    NULL,
    amount          DECIMAL(10, 2)  NOT NULL,
    status          VARCHAR(15)     NOT NULL DEFAULT 'pending',
    transaction_ref VARCHAR(64)     NULL,
    paid_at         DATETIME        NULL,
    PRIMARY KEY (id),
    KEY idx_payment_booking (booking_id, status),
    CONSTRAINT fk_payment_booking
        FOREIGN KEY (booking_id) REFERENCES booking (id) ON DELETE CASCADE,
    CONSTRAINT ck_payment_method
        CHECK (method IN ('upi', 'card', 'netbanking', 'wallet')),
    CONSTRAINT ck_payment_status
        CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
    CONSTRAINT ck_payment_amount
        CHECK (amount >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- --- 9a. Bus booking --------------------------------------------------------

CREATE TABLE bus_booking (
    booking_id        BIGINT UNSIGNED NOT NULL,
    trip_id           BIGINT UNSIGNED NOT NULL,
    travel_date       DATE            NOT NULL,
    boarding_point_id BIGINT UNSIGNED NULL,
    dropping_point_id BIGINT UNSIGNED NULL,
    seat_total        DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    service_fee       DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    gst               DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    PRIMARY KEY (booking_id),
    KEY idx_bus_booking_trip (trip_id, travel_date),
    KEY idx_bus_booking_boarding (boarding_point_id),
    KEY idx_bus_booking_dropping (dropping_point_id),
    CONSTRAINT fk_bus_booking_booking
        FOREIGN KEY (booking_id) REFERENCES booking (id) ON DELETE CASCADE,
    CONSTRAINT fk_bus_booking_trip
        FOREIGN KEY (trip_id) REFERENCES bus_trip (id),
    CONSTRAINT fk_bus_booking_boarding
        FOREIGN KEY (boarding_point_id) REFERENCES bus_stop_point (id),
    CONSTRAINT fk_bus_booking_dropping
        FOREIGN KEY (dropping_point_id) REFERENCES bus_stop_point (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- One row per seat sold, carrying the passenger who sits in it.
CREATE TABLE bus_booking_seat (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id       BIGINT UNSIGNED NOT NULL,
    seat_id          BIGINT UNSIGNED NOT NULL,
    travel_date      DATE            NOT NULL,
    passenger_name   VARCHAR(150)    NOT NULL,
    passenger_age    SMALLINT        NULL,
    passenger_gender VARCHAR(10)     NULL,
    fare             DECIMAL(10, 2)  NOT NULL,
    PRIMARY KEY (id),
    -- Stops the same seat being sold twice on the same day.
    UNIQUE KEY uq_bus_seat_per_date (seat_id, travel_date),
    KEY idx_bus_booking_seat_booking (booking_id),
    KEY idx_bus_booking_seat_date (travel_date),
    CONSTRAINT fk_bus_booking_seat_booking
        FOREIGN KEY (booking_id) REFERENCES bus_booking (booking_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_bus_booking_seat_seat
        FOREIGN KEY (seat_id) REFERENCES bus_seat (id),
    CONSTRAINT ck_bus_booking_seat_age
        CHECK (passenger_age IS NULL OR passenger_age BETWEEN 1 AND 120),
    CONSTRAINT ck_bus_booking_seat_gender
        CHECK (passenger_gender IS NULL
               OR passenger_gender IN ('male', 'female', 'other'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- --- 9b. Train booking ------------------------------------------------------

CREATE TABLE train_booking (
    booking_id          BIGINT UNSIGNED NOT NULL,
    train_id            BIGINT UNSIGNED NOT NULL,
    class_id            BIGINT UNSIGNED NOT NULL,
    quota_id            BIGINT UNSIGNED NOT NULL,
    travel_date         DATE            NOT NULL,
    boarding_station_id BIGINT UNSIGNED NULL,
    base_fare           DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    quota_surcharge     DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    reservation_charge  DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    insurance           DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    gst                 DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    is_insured          BOOLEAN         NOT NULL DEFAULT FALSE,
    chart_status        VARCHAR(120)    NULL,
    PRIMARY KEY (booking_id),
    KEY idx_train_booking_train (train_id, travel_date),
    KEY idx_train_booking_class (class_id),
    KEY idx_train_booking_quota (quota_id),
    KEY idx_train_booking_boarding (boarding_station_id),
    CONSTRAINT fk_train_booking_booking
        FOREIGN KEY (booking_id) REFERENCES booking (id) ON DELETE CASCADE,
    CONSTRAINT fk_train_booking_train
        FOREIGN KEY (train_id) REFERENCES train (id),
    CONSTRAINT fk_train_booking_class
        FOREIGN KEY (class_id) REFERENCES train_class (id),
    CONSTRAINT fk_train_booking_quota
        FOREIGN KEY (quota_id) REFERENCES train_quota (id),
    CONSTRAINT fk_train_booking_boarding
        FOREIGN KEY (boarding_station_id) REFERENCES train_station (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE train_passenger (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id       BIGINT UNSIGNED NOT NULL,
    full_name        VARCHAR(150)    NOT NULL,
    age              SMALLINT        NULL,
    gender           VARCHAR(10)     NULL,
    -- A request, not a guarantee; the railways allot on chart preparation.
    berth_preference VARCHAR(20)     NOT NULL DEFAULT 'no-preference',
    allotted_coach   VARCHAR(10)     NULL,
    allotted_berth   VARCHAR(60)     NULL,
    -- 'CNF', 'RAC 5', 'WL 3'.
    booking_status   VARCHAR(20)     NOT NULL DEFAULT 'CNF',
    sort_order       SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_train_passenger_booking (booking_id, sort_order),
    CONSTRAINT fk_train_passenger_booking
        FOREIGN KEY (booking_id) REFERENCES train_booking (booking_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_train_passenger_age
        CHECK (age IS NULL OR age BETWEEN 1 AND 120),
    CONSTRAINT ck_train_passenger_gender
        CHECK (gender IS NULL OR gender IN ('male', 'female', 'other')),
    CONSTRAINT ck_train_passenger_berth
        CHECK (berth_preference IN
               ('no-preference', 'lower', 'middle', 'upper',
                'side-lower', 'side-upper'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- --- 9c. Flight booking -----------------------------------------------------

CREATE TABLE flight_booking (
    booking_id      BIGINT UNSIGNED NOT NULL,
    flight_id       BIGINT UNSIGNED NOT NULL,
    fare_brand_id   BIGINT UNSIGNED NOT NULL,
    travel_date     DATE            NOT NULL,
    base_fare       DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    taxes           DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    seat_total      DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    addon_total     DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    convenience_fee DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    PRIMARY KEY (booking_id),
    KEY idx_flight_booking_flight (flight_id, travel_date),
    KEY idx_flight_booking_brand (fare_brand_id),
    CONSTRAINT fk_flight_booking_booking
        FOREIGN KEY (booking_id) REFERENCES booking (id) ON DELETE CASCADE,
    CONSTRAINT fk_flight_booking_flight
        FOREIGN KEY (flight_id) REFERENCES flight (id),
    CONSTRAINT fk_flight_booking_brand
        FOREIGN KEY (fare_brand_id) REFERENCES fare_brand (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE flight_traveller (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id     BIGINT UNSIGNED NOT NULL,
    traveller_type VARCHAR(10)     NOT NULL DEFAULT 'adult',
    title          VARCHAR(10)     NULL,
    first_name     VARCHAR(100)    NOT NULL,
    last_name      VARCHAR(100)    NOT NULL,
    -- Required for children and infants.
    date_of_birth  DATE            NULL,
    -- NULL when no seat was chosen; infants never get one.
    seat_id        BIGINT UNSIGNED NULL,
    seat_price     DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    eticket_number VARCHAR(30)     NULL,
    sort_order     SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_flight_traveller_booking (booking_id, sort_order),
    KEY idx_flight_traveller_seat (seat_id),
    CONSTRAINT fk_flight_traveller_booking
        FOREIGN KEY (booking_id) REFERENCES flight_booking (booking_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_flight_traveller_seat
        FOREIGN KEY (seat_id) REFERENCES flight_seat (id),
    CONSTRAINT ck_flight_traveller_type
        CHECK (traveller_type IN ('adult', 'child', 'infant')),
    CONSTRAINT ck_flight_traveller_title
        CHECK (title IS NULL OR title IN ('Mr', 'Ms', 'Mrs', 'Master', 'Miss')),
    CONSTRAINT ck_traveller_infant_no_seat
        CHECK (traveller_type <> 'infant' OR seat_id IS NULL),
    CONSTRAINT ck_traveller_dob
        CHECK (traveller_type = 'adult' OR date_of_birth IS NOT NULL)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE flight_booking_addon (
    booking_id BIGINT UNSIGNED NOT NULL,
    addon_id   BIGINT UNSIGNED NOT NULL,
    -- Charged once per traveller.
    quantity   SMALLINT        NOT NULL DEFAULT 1,
    amount     DECIMAL(10, 2)  NOT NULL,
    PRIMARY KEY (booking_id, addon_id),
    KEY idx_flight_booking_addon_addon (addon_id),
    CONSTRAINT fk_flight_booking_addon_booking
        FOREIGN KEY (booking_id) REFERENCES flight_booking (booking_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_flight_booking_addon_addon
        FOREIGN KEY (addon_id) REFERENCES flight_addon (id),
    CONSTRAINT ck_flight_booking_addon_quantity
        CHECK (quantity > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- --- 9d. Hotel booking ------------------------------------------------------

CREATE TABLE hotel_booking (
    booking_id       BIGINT UNSIGNED NOT NULL,
    property_id      BIGINT UNSIGNED NOT NULL,
    room_type_id     BIGINT UNSIGNED NOT NULL,
    rate_plan_id     BIGINT UNSIGNED NOT NULL,
    check_in         DATE            NOT NULL,
    check_out        DATE            NOT NULL,
    nights           SMALLINT        NOT NULL,
    rooms            SMALLINT        NOT NULL DEFAULT 1,
    guests           SMALLINT        NOT NULL DEFAULT 1,
    room_total       DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    -- 12 below Rs 7,500 a night, 18 at or above - the Indian slab.
    tax_rate_percent DECIMAL(5, 2)   NOT NULL DEFAULT 12.00,
    taxes            DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    property_fee     DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    arrival_window   VARCHAR(40)     NULL,
    special_requests VARCHAR(400)    NULL,
    PRIMARY KEY (booking_id),
    KEY idx_hotel_booking_property (property_id, check_in),
    KEY idx_hotel_booking_room (room_type_id),
    KEY idx_hotel_booking_plan (rate_plan_id),
    CONSTRAINT fk_hotel_booking_booking
        FOREIGN KEY (booking_id) REFERENCES booking (id) ON DELETE CASCADE,
    CONSTRAINT fk_hotel_booking_property
        FOREIGN KEY (property_id) REFERENCES property (id),
    CONSTRAINT fk_hotel_booking_room
        FOREIGN KEY (room_type_id) REFERENCES room_type (id),
    CONSTRAINT fk_hotel_booking_plan
        FOREIGN KEY (rate_plan_id) REFERENCES rate_plan (id),
    CONSTRAINT ck_hotel_dates
        CHECK (check_out > check_in),
    CONSTRAINT ck_hotel_nights
        CHECK (nights > 0),
    CONSTRAINT ck_hotel_rooms
        CHECK (rooms > 0),
    CONSTRAINT ck_hotel_guests
        CHECK (guests > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE hotel_guest (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id BIGINT UNSIGNED NOT NULL,
    full_name  VARCHAR(150)    NOT NULL,
    -- The booking is held under the lead guest's name.
    is_lead    BOOLEAN         NOT NULL DEFAULT FALSE,
    sort_order SMALLINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_hotel_guest_booking (booking_id, sort_order),
    CONSTRAINT fk_hotel_guest_booking
        FOREIGN KEY (booking_id) REFERENCES hotel_booking (booking_id)
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- --- 9e. Cab booking --------------------------------------------------------

CREATE TABLE cab_booking (
    booking_id       BIGINT UNSIGNED NOT NULL,
    category_id      BIGINT UNSIGNED NOT NULL,
    rate_card_id     BIGINT UNSIGNED NULL,
    trip_type        VARCHAR(20)     NOT NULL,
    pickup_address   VARCHAR(500)    NOT NULL,
    drop_address     VARCHAR(500)    NOT NULL,
    pickup_at        DATETIME        NOT NULL,
    distance_km      INT UNSIGNED    NOT NULL DEFAULT 0,
    duration_minutes INT UNSIGNED    NOT NULL DEFAULT 0,
    is_night_trip    BOOLEAN         NOT NULL DEFAULT FALSE,
    passenger_name   VARCHAR(150)    NOT NULL,
    passenger_phone  VARCHAR(15)     NOT NULL,
    base_fare        DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    extras_total     DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    driver_allowance DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    tolls_state_tax  DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    night_charge     DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    gst              DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    -- The fare splits: an advance online, the balance paid to the driver.
    pay_now          DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    pay_to_driver    DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
    -- Filled in once a vehicle is assigned, two hours before pickup.
    driver_name      VARCHAR(120)    NULL,
    driver_phone     VARCHAR(15)     NULL,
    vehicle_number   VARCHAR(20)     NULL,
    PRIMARY KEY (booking_id),
    KEY idx_cab_booking_category (category_id),
    KEY idx_cab_booking_rate_card (rate_card_id),
    KEY idx_cab_booking_pickup (pickup_at),
    CONSTRAINT fk_cab_booking_booking
        FOREIGN KEY (booking_id) REFERENCES booking (id) ON DELETE CASCADE,
    CONSTRAINT fk_cab_booking_category
        FOREIGN KEY (category_id) REFERENCES cab_category (id),
    CONSTRAINT fk_cab_booking_rate_card
        FOREIGN KEY (rate_card_id) REFERENCES cab_rate_card (id),
    CONSTRAINT ck_cab_booking_trip_type
        CHECK (trip_type IN ('outstation', 'airport', 'local'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE cab_booking_extra (
    booking_id BIGINT UNSIGNED NOT NULL,
    extra_id   BIGINT UNSIGNED NOT NULL,
    amount     DECIMAL(10, 2)  NOT NULL,
    PRIMARY KEY (booking_id, extra_id),
    KEY idx_cab_booking_extra_extra (extra_id),
    CONSTRAINT fk_cab_booking_extra_booking
        FOREIGN KEY (booking_id) REFERENCES cab_booking (booking_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_cab_booking_extra_extra
        FOREIGN KEY (extra_id) REFERENCES cab_extra (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- ============================================================================
-- 10. Reference data
--
-- Only the fixed lookups the front end currently hardcodes. Operators, trains,
-- flights, properties and cities are business data and are not seeded here.
-- ============================================================================

INSERT INTO train_class
    (code, label, is_air_conditioned, reservation_charge, sort_order)
VALUES
    ('1A', 'AC First Class (1A)', TRUE,  60.00, 1),
    ('2A', 'AC 2 Tier (2A)',      TRUE,  50.00, 2),
    ('3A', 'AC 3 Tier (3A)',      TRUE,  40.00, 3),
    ('3E', 'AC 3 Economy (3E)',   TRUE,  40.00, 4),
    ('CC', 'AC Chair Car (CC)',   TRUE,  40.00, 5),
    ('SL', 'Sleeper (SL)',        FALSE, 20.00, 6),
    ('2S', 'Second Sitting (2S)', FALSE, 15.00, 7);

INSERT INTO train_quota (code, label, note, surcharge_percent) VALUES
    ('general', 'General',
     'Standard booking, opens 60 days before departure.', 0.00),
    ('tatkal',  'Tatkal',
     'Opens one day before departure. Premium fare, no refund on cancellation.', 30.00),
    ('ladies',  'Ladies',
     'Reserved for women travellers and children under 12 with them.', 0.00),
    ('senior',  'Senior citizen',
     'For travellers aged 60 and above. Lower berths are preferred where free.', 0.00);

INSERT INTO flight_addon (code, label, description, price) VALUES
    ('meal',     'Pre-book a meal',
     'Hot vegetarian or non-vegetarian meal, served on board.', 400.00),
    ('baggage',  'Extra 5 kg check-in baggage',
     'Cheaper now than at the airport counter.', 750.00),
    ('priority', 'Priority check-in and boarding',
     'Dedicated counter and first boarding group.', 300.00);

INSERT INTO cab_category
    (code, name, models, seats, luggage, is_air_conditioned)
VALUES
    ('hatchback', 'Hatchback',   'Swift, WagonR or similar',   4, 2, TRUE),
    ('sedan',     'Sedan',       'Dzire, Etios or similar',    4, 3, TRUE),
    ('suv',       'SUV',         'Ertiga, Marazzo or similar', 6, 4, TRUE),
    ('premium',   'Premium SUV', 'Innova Crysta or similar',   6, 4, TRUE);

INSERT INTO cab_extra (code, label, description, price) VALUES
    ('carrier',   'Roof carrier',
     'For bulky luggage that will not fit in the boot.', 300.00),
    ('childSeat', 'Child seat',
     'Rear-facing seat for children under four.', 250.00),
    ('extraStop', 'One extra stop',
     'A halt of up to 30 minutes along the route.', 200.00);

INSERT INTO bus_amenity (name) VALUES
    ('Wi-Fi'), ('Charging point'), ('Blanket'), ('Water bottle'),
    ('Reading light'), ('CCTV'), ('Emergency exit'), ('Track my bus');

INSERT INTO hotel_amenity (name) VALUES
    ('Free Wi-Fi'), ('Swimming pool'), ('Fitness centre'), ('Free parking'),
    ('Restaurant'), ('Room service'), ('Airport shuttle'), ('Power backup'),
    ('Air conditioning'), ('Flat-screen TV'), ('Tea & coffee maker'),
    ('Work desk'), ('Safe'), ('Balcony');


-- ============================================================================
-- 12. master_train - the Indian Railways station code index
--
-- The full station list the train booking form's "From station" / "To station"
-- dropdowns are populated from. Kept separate from `train_station`, which only
-- holds the stations that actually appear on a seeded route.
-- ============================================================================

CREATE TABLE master_train (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    station_name VARCHAR(150)    NOT NULL,
    station_code VARCHAR(10)     NOT NULL,
    is_active    BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_master_train_code (station_code),
    KEY idx_master_train_name (station_name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT INTO master_train (station_name, station_code) VALUES
    ('ABU ROAD', 'ABR'),
    ('ADILABAD', 'ADB'),
    ('ADONI', 'AD'),
    ('ADRA', 'ADRA'),
    ('AGARTALA', 'AGTL'),
    ('AGRA FORT', 'AF'),
    ('AGRA CANTT.', 'AGC'),
    ('AHMADNAGAR', 'ANG'),
    ('AHMEDABAD', 'ADI'),
    ('AJMER', 'AII'),
    ('AJNI', 'AJNI'),
    ('AKOLA', 'AK'),
    ('ALIGARH', 'ALJN'),
    ('ALIPURDUAR JN.', 'APDJ'),
    ('ALLAHABAD', 'ALD'),
    ('ALAPPUZHA', 'ALLP'),
    ('ALNAWAR JN.', 'LWR'),
    ('ALUVA', 'AWY'),
    ('ALWAR', 'AWR'),
    ('AMALNER', 'AN'),
    ('AMB ANDAVRA', 'AADR'),
    ('AMBALA CANTT.', 'UMB'),
    ('AMBIKAPUR', 'ABKP'),
    ('AMLA', 'AMLA'),
    ('AMRITSAR', 'ASR'),
    ('ANAKAPALLE', 'AKP'),
    ('ANAND', 'ANND'),
    ('ANAND NAGAR', 'ANDN'),
    ('ANAND VIHAR TERMINUS', 'ANVT'),
    ('ANANTAPUR', 'ATP'),
    ('ANGUL', 'ANGL'),
    ('ANNAVARAM', 'ANV'),
    ('ANUPPUR', 'APR'),
    ('ARA', 'ARA'),
    ('ARAKKONAM', 'AJJ'),
    ('ARSIKERE', 'ASK'),
    ('ASANSOL', 'ASN'),
    ('AUNRIHAR', 'ARJ'),
    ('AURANGABAD', 'AWB'),
    ('AYODHYA', 'AY'),
    ('AZAMGARH', 'AMH'),
    ('AZIMGANJ JN.', 'AZ'),
    ('BADARPUR', 'BPB'),
    ('BADNERA JN.', 'BD'),
    ('BAGALKOT', 'BGK'),
    ('BAGHPAT ROAD', 'BPM'),
    ('BAIDYANATHDHAM', 'BDME'),
    ('BAKTHIYARPUR', 'BKP'),
    ('BALASORE', 'BLS'),
    ('BALAGHAT', 'BTC'),
    ('BALANGIR', 'BLGR'),
    ('BALUGAON', 'BALU'),
    ('BALURGHAT', 'BLGT'),
    ('BALHARSHAH', 'BPQ'),
    ('BALLIA', 'BUI'),
    ('BANARHAT', 'BNQ'),
    ('BANDA JN.', 'BNDA'),
    ('BANDEL JN.', 'BDC'),
    ('BANDIKUI JN.', 'BKI'),
    ('BANDRA (T)', 'BDTS'),
    ('BANGALORE CITY', 'SBC'),
    ('BANGALORE CANTT.', 'BNC'),
    ('BANGARAPET', 'BWT'),
    ('BANGRIPOSI', 'BGY'),
    ('BANKURA', 'BQA'),
    ('BANMANKHI', 'BNKI'),
    ('BAPATLA', 'BPP'),
    ('BARABANKI JN.', 'BBK'),
    ('BARABIL', 'BBN'),
    ('BARAN', 'BAZ'),
    ('BARAUNI JN.', 'BJU'),
    ('BARAUT', 'BTU'),
    ('BARAPALLI', 'BRPL'),
    ('BARDDHAMAN JN.', 'BWN'),
    ('BAREILLY', 'BE'),
    ('BARGARH ROAD', 'BRGA'),
    ('BARHNI', 'BNY'),
    ('BARKAKANA', 'BRKA'),
    ('BARMER', 'BME'),
    ('BAROG', 'BOF'),
    ('BARSOI', 'BOE'),
    ('BARWADIH', 'BRWD'),
    ('BASAR', 'BSX'),
    ('BASTI', 'BST'),
    ('BATHINDA JN.', 'BTI'),
    ('BAYANA', 'BXN'),
    ('BEAS', 'BEAS'),
    ('BEAWAR', 'BER'),
    ('BELAPUR', 'BAP'),
    ('BELGAUM', 'BGM'),
    ('BELLARY JN.', 'BAY'),
    ('BETTIAH', 'BTH'),
    ('BETUL', 'BZU'),
    ('BHADOHI', 'BOY'),
    ('BHADRAK', 'BHC'),
    ('BHAGALPUR', 'BGP'),
    ('BHAGAT KI KOTHI', 'BGKI'),
    ('BHARATPUR', 'BTE'),
    ('BHARUCH', 'BH'),
    ('BHATAPARA', 'BYT'),
    ('BHATKAL', 'BTJL'),
    ('BHATNI', 'BTT'),
    ('BHAVNAGAR (T)', 'BVC'),
    ('BHAWANIPATNA', 'BWPI'),
    ('BHILWARA', 'BHL'),
    ('BHIMAVARAM JN.', 'BVRM'),
    ('BHIMAVARAM TOWN', 'BVRT'),
    ('BHIND', 'BIX'),
    ('BHIWANI', 'BNW'),
    ('BHOPAL', 'BPL'),
    ('BHUBANESWAR', 'BBS'),
    ('BHUJ', 'BHUJ'),
    ('BHUSAVAL', 'BSL'),
    ('BIJAPUR', 'BJP'),
    ('BIJNOR', 'BJO'),
    ('BIKANER', 'BKN'),
    ('BILASPUR JN.', 'BSP'),
    ('BINA', 'BINA'),
    ('BINNAGURI', 'BNV'),
    ('BIRUR', 'RRB'),
    ('BITRAGUNTA', 'BTTR'),
    ('BIYAVARA RAJGARH', 'BRRG'),
    ('BOBBILI', 'VBL'),
    ('BOINDA', 'BONA'),
    ('BAGHBAHAR', 'BGBR'),
    ('BOKARO STEEL CITY', 'BKSC'),
    ('BOLPUR SHANTINIKETAN', 'BHP'),
    ('BORIVALI', 'BVI'),
    ('BOTAD', 'BTD'),
    ('BUDAUN', 'BEM'),
    ('BUNDI', 'BUDI'),
    ('BURHANPUR', 'BAU'),
    ('BURHWAL', 'BUW'),
    ('BUXAR', 'BXR'),
    ('CANACONA', 'CNO'),
    ('CHAKIA', 'CAA'),
    ('CHAKKI BANK', 'CHKB'),
    ('CHAKRADHARPUR', 'CKP'),
    ('CHALISGAON', 'CSN'),
    ('CHAMPA', 'CPH'),
    ('CHANDAUSI', 'CH'),
    ('CHANDERIYA', 'CNA'),
    ('CHANDIGARH', 'CDG'),
    ('CHANDIL', 'CNI'),
    ('CHANDRAPUR', 'CD'),
    ('CHANDRAPURA', 'CRP'),
    ('CHAPARMUKH', 'CPK'),
    ('CHATRAPUR', 'CAP'),
    ('CHENGALPATTU JN.', 'CGL'),
    ('CHENGANNUR', 'CNGR'),
    ('CHENNAI CENTRAL', 'MAS'),
    ('CHENNAI EGMORE', 'MS'),
    ('CHHAPRA', 'CPR'),
    ('CHHINDWARA', 'CWA'),
    ('CHIDAMBARAM', 'CDM'),
    ('CHIKJAJUR', 'JRU'),
    ('CHIPLUN', 'CHI'),
    ('CHIRALA', 'CLX'),
    ('CHITRAKOOTDHAM KARVI', 'CKTD'),
    ('CHITTARANJAN', 'CRJ'),
    ('CHITTAURGARH', 'COR'),
    ('CHITTOOR', 'CTO'),
    ('CHOPAN', 'CPU'),
    ('CHUNAR', 'CAR'),
    ('CHURU', 'CUR'),
    ('COIMBATORE JN.', 'CBE'),
    ('COONOOR', 'ONR'),
    ('CUDDALORE PORT', 'CUPJ'),
    ('CUDDAPAH', 'HX'),
    ('CUTTACK', 'CTC'),
    ('DADAR', 'DR'),
    ('DAHANU ROAD', 'DRD'),
    ('DAHOD', 'DHD'),
    ('DALGAON', 'DLO'),
    ('DALTONGANJ', 'DTO'),
    ('DALLIRAJHARA', 'DRZ'),
    ('DAMOH', 'DMO'),
    ('DANAPUR', 'DNR'),
    ('DARBHANGA', 'DBG'),
    ('DAUND', 'DD'),
    ('DAVANGERE', 'DVG'),
    ('DEHRADUN', 'DDN'),
    ('DEHRI-ON-SONE', 'DOS'),
    ('DELHI', 'DLI'),
    ('NEW DELHI', 'NDLS'),
    ('DELHI CANTT.', 'DEC'),
    ('DELHI SARAI ROHILLA', 'DEE'),
    ('DELHI SHAHDARA', 'DSA'),
    ('DEORIASADAR', 'DEOS'),
    ('DEVLALI', 'DVL'),
    ('DHAMANGAON', 'DMN'),
    ('DHANBAD', 'DHN'),
    ('DHARMABAD', 'DAB'),
    ('DHARMANAGAR', 'DMR'),
    ('DHARMAPURI', 'DPJ'),
    ('DHARMAVARAM', 'DMM'),
    ('DHARWAD', 'DWR'),
    ('DHASA', 'DAS'),
    ('DHAULPUR', 'DHO'),
    ('DHENUANAL', 'DNUL'),
    ('DHOLA', 'DLJ'),
    ('DHONE', 'DHNE'),
    ('DHRANGADHRA', 'DHG'),
    ('DHUBRI', 'DBB'),
    ('DHURI', 'DUI'),
    ('DIBRUGARH', 'DBRG'),
    ('DIBRUGARH TOWN', 'DBRT'),
    ('DIGHA', 'DGHA'),
    ('DILDARNAGAR', 'DLN'),
    ('DIMAPUR', 'DMV'),
    ('DINDIGUL JN.', 'DG'),
    ('DONGARGARH', 'DGG'),
    ('DORNAKAL', 'DKJ'),
    ('DUNGARPUR', 'DNRP'),
    ('DURG', 'DURG'),
    ('DURGAPUR', 'DGR'),
    ('DUVVADA', 'DVD'),
    ('DWARKA', 'DWK'),
    ('ELURU', 'EE'),
    ('ERNAKULAM JN.', 'ERS'),
    ('ERNAKULAM TOWN', 'ERN'),
    ('ERODE', 'ED'),
    ('ETAWAH', 'ETW'),
    ('FAIZABAD', 'FD'),
    ('FARIDABAD', 'FDB'),
    ('FARRUKHABAD', 'FBD'),
    ('FATEHABAD CHAND', 'FTD'),
    ('FATEHPUR', 'FTP'),
    ('FATUHA', 'FUT'),
    ('FAZILKA', 'FKA'),
    ('FIROZABAD', 'FZD'),
    ('FIROZPUR CITY', 'FZP'),
    ('FIROZPUR CANTT.', 'FZR'),
    ('FORBESGANJ', 'FBG'),
    ('FURKATING', 'FKG'),
    ('GADAG', 'GDG'),
    ('GAJRAULA', 'GJL'),
    ('GANDHIDHAM', 'GIM'),
    ('GANDHINAGAR', 'GADJ'),
    ('GANGAPUR CITY', 'GGC'),
    ('GARWA ROAD', 'GHD'),
    ('GAYA', 'GAYA'),
    ('GEVRA ROAD', 'GAD'),
    ('GHATSILA', 'GTS'),
    ('GHAZIABAD', 'GZB'),
    ('GOALPARA TOWN', 'GLPT'),
    ('GODHRA', 'GDA'),
    ('GOLA GOKARANNATH', 'GK'),
    ('GONDA', 'GD'),
    ('GONDIA', 'G'),
    ('GOOTY', 'GY'),
    ('GORAKHPUR', 'GKP'),
    ('GOSSAINGAON HAT', 'GOGH'),
    ('GUDIVADA', 'GDV'),
    ('GUDUR', 'GDR'),
    ('GULBARGA', 'GR'),
    ('GUNA', 'GUNA'),
    ('GUNTAKAL', 'GTL'),
    ('GUNTUR', 'GNT'),
    ('GURGAON', 'GGN'),
    ('GURUVAYUR', 'GUV'),
    ('GUWAHATI', 'GHY'),
    ('GWALIOR', 'GWL'),
    ('GYANPUR ROAD', 'GYN'),
    ('HABIBGANJ', 'HBJ'),
    ('HAJIPUR', 'HJP'),
    ('HALDIA', 'HLZ'),
    ('HALDIBARI', 'HDB'),
    ('HAMILTONGANJ', 'HOJ'),
    ('HANUMANGARH', 'HMH'),
    ('HAPA', 'HAPA'),
    ('HAPUR', 'HPU'),
    ('HARDA', 'HD'),
    ('HARIDWAR', 'HW'),
    ('HARIHAR', 'HRR'),
    ('HARPALPUR', 'HPP'),
    ('HASIMARA', 'HSA'),
    ('HATIA', 'HTE'),
    ('HAZUR SAHIB NANDED', 'NED'),
    ('HILSA', 'HIL'),
    ('HIMMAT NAGAR', 'HMT'),
    ('HINDUPUR', 'HUP'),
    ('HINGOLI', 'HNL'),
    ('HISAR', 'HSR'),
    ('HOSHANGABAD', 'HBD'),
    ('HOSPET', 'HPT'),
    ('HOSUR', 'HSRA'),
    ('HOWBADH', 'HBG'),
    ('HOWRAH', 'HWH'),
    ('HUBLI', 'UBL'),
    ('HYDERABAD', 'HYB'),
    ('IGATPURI', 'IGP'),
    ('INDARA', 'IAA'),
    ('INDORE', 'INDB'),
    ('ISLAMPUR', 'IPR'),
    ('ITARSI', 'ET'),
    ('JABALPUR', 'JBP'),
    ('JAGDALPUR', 'JDB'),
    ('JAIPUR', 'JP'),
    ('JAYPUR', 'JYP'),
    ('JAISALMER', 'JSM'),
    ('JAJPUR KEONJHAR ROAD', 'JJKR'),
    ('JAKHAL', 'JHL'),
    ('JALAMB', 'JM'),
    ('JALANDHAR CANTT.', 'JRC'),
    ('JALANDHAR CITY', 'JUC'),
    ('JALGAON', 'JL'),
    ('JALNA', 'J'),
    ('JALPAIGURI', 'JPG'),
    ('JAMALPUR', 'JMP'),
    ('JAMMU TAWI', 'JAT'),
    ('JAMNAGAR', 'JAM'),
    ('JANGHAI', 'JNH'),
    ('JASIDIH', 'JSME'),
    ('JAUNPUR JN.', 'JNU'),
    ('JAYNAGAR', 'JYG'),
    ('JETALSAR', 'JLR'),
    ('JHAJHA', 'JAJ'),
    ('JHANSI', 'JHS'),
    ('JHARGRAM', 'JGM'),
    ('JHARSUGUDA', 'JSG'),
    ('JIND', 'JIND'),
    ('JODHPUR', 'JU'),
    ('JOGBANI', 'JBN'),
    ('JOLARPETTAI', 'JTJ'),
    ('JORHAT', 'JT'),
    ('JUNAGARH JN.', 'JND'),
    ('KACHEGUDA', 'KCG'),
    ('KAKINADA PORT', 'COA'),
    ('KALCHINI', 'KCF'),
    ('KALKA', 'KLK'),
    ('KALOL', 'KLL'),
    ('KALYAN', 'KYN'),
    ('KAMAKHYA', 'KYQ'),
    ('KANCHIPURAM', 'CJ'),
    ('KANDHLA', 'KQL'),
    ('KANNIYAKUMARI', 'CAPE'),
    ('KANNUR', 'CAN'),
    ('KANPUR CENTRAL', 'CNB'),
    ('KANPUR ANWARGANJ', 'CPA'),
    ('KAPTANGANJ', 'CPJ'),
    ('KARAIKAL', 'KIK'),
    ('KARAIKKUDI JN.', 'KKDI'),
    ('KARIMGANJ', 'KXJ'),
    ('KARNAL', 'KUN'),
    ('KARUR', 'KRR'),
    ('KARWAR', 'KAWR'),
    ('KASARAGOD', 'KGQ'),
    ('KASGANJ', 'KSJ'),
    ('KATHGODAM', 'KGM'),
    ('KATIHAR', 'KIR'),
    ('KATNI', 'KTE'),
    ('KATNI MURWARA', 'KMZ'),
    ('KATPADI', 'KPD'),
    ('KATWA', 'KWAE'),
    ('KAZIPET', 'KZJ'),
    ('KESINGA', 'KSNG'),
    ('KENDUJHARGARH', 'KDJR'),
    ('KHAGARIA', 'KGG'),
    ('KHALILABAD', 'KLD'),
    ('KHAMMAM', 'KMT'),
    ('KHANDWA', 'KNW'),
    ('KHARAGPUR', 'KGP'),
    ('KHEKRA', 'KEX'),
    ('KHURDA ROAD', 'KUR'),
    ('KHURJA', 'KRJ'),
    ('KISHANGANJ', 'KNE'),
    ('KISHANGARH', 'KSG'),
    ('KIUL', 'KIUL'),
    ('KOCHUVELI', 'KCVL'),
    ('KODAIKANAL ROAD', 'KQN'),
    ('KOLKATA', 'KOAA'),
    ('KOLLAM', 'QLN'),
    ('KOPERGAON', 'KPG'),
    ('KORAPUT', 'KRPU'),
    ('KORBA', 'KRBA'),
    ('KOTA', 'KOTA'),
    ('KOTDWARA', 'KTW'),
    ('KOT KAPURA', 'KKP'),
    ('KOTTAYAM', 'KTYM'),
    ('KOZHIKODE', 'CLT'),
    ('KRISHNANAGAR CITY', 'KNJ'),
    ('KRISHNARAJAPURAM', 'KJM'),
    ('KUMARGHAT', 'KUGT'),
    ('KUMBAKONAM', 'KMU'),
    ('KUNDAPURA', 'KUDA'),
    ('KURDUWADI', 'KWV'),
    ('KURNOOL TOWN', 'KRNT'),
    ('KURUKSHETRA', 'KKDE'),
    ('LAKHIMPUR', 'LMP'),
    ('LAKSAR', 'LRJ'),
    ('LALGARH', 'LGH'),
    ('LALGOLA', 'LGL'),
    ('LALITPUR', 'LAR'),
    ('LALKUAN JN.', 'LKU'),
    ('LATUR', 'LUR'),
    ('LEDO', 'LEDO'),
    ('LOHARU', 'LHU'),
    ('LOKMANYA TILAK (T)', 'LTT'),
    ('LONAVLA', 'LNL'),
    ('LONDA', 'LD'),
    ('LOWER HALFLONG', 'LFG'),
    ('LUCKNOW', 'LKO'),
    ('LUDHIANA', 'LDH'),
    ('LUMDING', 'LMG'),
    ('LUNI', 'LUNI'),
    ('MACHILIPATNAM', 'MTM'),
    ('MADARIHAT', 'MDT'),
    ('MADDUR', 'MAD'),
    ('MADGAON (GOA)', 'MAO'),
    ('MADHUBANI', 'MBI'),
    ('MADHUPUR', 'MDP'),
    ('MADURAI JN.', 'MDU'),
    ('MAHASAMUND', 'MSMD'),
    ('MAHBUBNAGAR', 'MBNR'),
    ('MAHUVA', 'MHV'),
    ('MUNIGUDA', 'MNGD'),
    ('MAHESANA', 'MSH'),
    ('MAHOBA', 'MBA'),
    ('MAILANI', 'MLN'),
    ('MAKSI', 'MKC'),
    ('MALDA TOWN', 'MLDT'),
    ('MANAMADURAI', 'MNM'),
    ('MANDUADIH', 'MUV'),
    ('MANGALORE CENTRAL', 'MAQ'),
    ('MANGALORE JN.', 'MAJN'),
    ('MANIKPUR', 'MKP'),
    ('MANKAPUR', 'MUR'),
    ('MANMAD', 'MMR'),
    ('MANNARGUDI', 'MQ'),
    ('MANSI', 'MNE'),
    ('MANU', 'MANU'),
    ('MARIANI', 'MXN'),
    ('MARWAR JN.', 'MJ'),
    ('MATHURA', 'MTJ'),
    ('MAU', 'MAU'),
    ('MAYILADUTURAI JN.', 'MV'),
    ('MEERUT CITY', 'MTC'),
    ('MERTA ROAD', 'MTD'),
    ('METTUPALAYAM', 'MTP'),
    ('MIDNAPORE', 'MDN'),
    ('MIRAJ', 'MRJ'),
    ('MIRYALAGUDA', 'MRGA'),
    ('MIRZAPUR', 'MZP'),
    ('MOGA', 'MOF'),
    ('MOKAMA', 'MKA'),
    ('MORADABAD', 'MB'),
    ('MOTIHARI', 'MKI'),
    ('MUDKHED', 'MUE'),
    ('MUGHALSARAI', 'MGS'),
    ('MUMBAI CENTRAL', 'BCT'),
    ('MUMBAI CST', 'CSTM'),
    ('MURI', 'MURI'),
    ('MURKEONGSELEK', 'MZS'),
    ('MURTAJAPUR', 'MZR'),
    ('MUZAFFAR NAGAR', 'MOZ'),
    ('MUZAFFARPUR', 'MFP'),
    ('MYSORE', 'MYS'),
    ('NABADWIPDHAM', 'NDAE'),
    ('NADIAD', 'ND'),
    ('NADIKUDI', 'NDKD'),
    ('NAGAPPATTINAM', 'NGT'),
    ('NAGARKATA', 'NKB'),
    ('NAGARSOL', 'NSL'),
    ('NAGBHIR', 'NAB'),
    ('NAGDA', 'NAD'),
    ('NAGERCOIL JN.', 'NCJ'),
    ('NAGORE', 'NCR'),
    ('NAGPUR', 'NGP'),
    ('NAINPUR', 'NIR'),
    ('NAJIBABAD', 'NBD'),
    ('NALANDA', 'NLD'),
    ('NALGONDA', 'NLDA'),
    ('NAMAKKAL', 'NMKL'),
    ('NANDALUR', 'NRE'),
    ('NANDGAON', 'NGN'),
    ('NANDURBAR', 'NDB'),
    ('NANDYAL', 'NDL'),
    ('NANGAL DAM', 'NLDM'),
    ('NARKATIAGANJ', 'NKE'),
    ('NARASAPUR', 'NS'),
    ('NARSINGPUR', 'NU'),
    ('NARWANA', 'NRW'),
    ('NASIK ROAD', 'NK'),
    ('NAUGARH', 'NUH'),
    ('NELLORE', 'NLR'),
    ('NETAJI SUBHASH CHANDRA BOSE GOMOH', 'GMO'),
    ('NEW ALIPURDUAR', 'NOQ'),
    ('NEW BONGAIGAON', 'NBQ'),
    ('NEW COOCHBEHAR', 'NCB'),
    ('NEW FARAKKA', 'NFK'),
    ('NEW JALPAIGURI', 'NJP'),
    ('NEWMAL JN.', 'NMZ'),
    ('NEW TINSUKIA', 'NTSK'),
    ('NIDADAVOLU', 'NDD'),
    ('NIDAMANGALAM', 'NMJ'),
    ('NIDUBROLU', 'NDO'),
    ('NIMACH', 'NMH'),
    ('NIZAMABAD', 'NZB'),
    ('NIZAMUDDIN', 'NZM'),
    ('NOLI', 'NOLI'),
    ('NORTH LAKHIMPUR', 'NLP'),
    ('ODLABARI', 'ODB'),
    ('OKHA', 'OKHA'),
    ('ONGOLE', 'OGL'),
    ('ORAI', 'ORAI'),
    ('PACHORA', 'PC'),
    ('PALANI', 'PLNI'),
    ('PALANPUR', 'PNU'),
    ('PALASA', 'PSA'),
    ('PALAKKAD', 'PGT'),
    ('PALAKKAD TOWN', 'PGTN'),
    ('PALIAKALAN', 'PLK'),
    ('PANDHARAPUR', 'PVR'),
    ('PANIPAT', 'PNP'),
    ('PARADEEP', 'PRDP'),
    ('PARASNATH', 'PNME'),
    ('PANVEL', 'PNVL'),
    ('PARBHANI', 'PBN'),
    ('PARVATIPURAM TOWN', 'PVPT'),
    ('PATHANKOT', 'PTK'),
    ('PATIALA', 'PTA'),
    ('PATNA', 'PNBE'),
    ('PATNA SAHIB', 'PNC'),
    ('PHALODI', 'PLC'),
    ('PHAPHAMAU', 'PFM'),
    ('PHULERA', 'FL'),
    ('PILIBHIT', 'PBE'),
    ('PIPARIYA', 'PPI'),
    ('PODANUR', 'PTJ'),
    ('PORBANDAR', 'PBR'),
    ('PRATAPGARH', 'PBH'),
    ('PUDUCHERRY', 'PDY'),
    ('PUDUKOTTAI', 'PDKT'),
    ('PULGAON', 'PLO'),
    ('PUNE JN.', 'PUNE'),
    ('PURANPUR', 'PP'),
    ('PURI', 'PURI'),
    ('PURNA', 'PAU'),
    ('PURNIA', 'PRNA'),
    ('PURULIA', 'PRR'),
    ('RADHIKAPUR', 'RDP'),
    ('RAE BARELI', 'RBL'),
    ('RAICHUR', 'RC'),
    ('RAIGARH', 'RIG'),
    ('RAIPUR', 'R'),
    ('RAJAHMUNDRY', 'RJY'),
    ('RAJA-KA-SAHASPUR', 'RJK'),
    ('RAJA-KI-MANDI', 'RKM'),
    ('RAJENDRANAGAR', 'RJQ'),
    ('RAJGIR', 'RGD'),
    ('RAJKOT', 'RJT'),
    ('RAJNANDGAON', 'RJN'),
    ('RAJPURA', 'RPJ'),
    ('RAMAGUNDAM', 'RDM'),
    ('RAMANATHAPURAM', 'RMD'),
    ('RAMESWARAM', 'RMM'),
    ('RAMNAGAR', 'RMR'),
    ('RAMPUR JN.', 'RMU'),
    ('RAMPURHAT', 'RPH'),
    ('RANAGHAT', 'RHA'),
    ('RANCHI', 'RNC'),
    ('RANGAPARA NORTH', 'RPAN'),
    ('RANGIYA', 'RNY'),
    ('RANINAGAR', 'ROJ'),
    ('RATANGARH', 'RTGH'),
    ('RATLAM', 'RTM'),
    ('RATNAGIRI', 'RN'),
    ('RAWATGANJ', 'RJ'),
    ('RAXAUL', 'RXL'),
    ('RAYAGADA', 'RGDA'),
    ('RENIGUNTA', 'RU'),
    ('REWA', 'REWA'),
    ('REWARI', 'RE'),
    ('RINGUS', 'RGS'),
    ('ROHTAK', 'ROK'),
    ('ROORKEE', 'RK'),
    ('ROURKELA', 'ROU'),
    ('SADULPUR', 'SDLP'),
    ('SAGAR JAMBAGARU', 'SRF'),
    ('SAGAULI', 'SGL'),
    ('SAGOUR', 'SGO'),
    ('SAHARANPUR', 'SRE'),
    ('SAHARSA', 'SHC'),
    ('SAHIBGANJ', 'SBG'),
    ('SAI NAGAR SHIRDI', 'SNSI'),
    ('SALEM', 'SA'),
    ('SALEMPUR', 'SRU'),
    ('SAMALKOT', 'SLO'),
    ('SAMASTIPUR', 'SPJ'),
    ('SAMBALPUR', 'SBP'),
    ('SAMBALPUR CITY', 'SBPY'),
    ('SAMDARI', 'SMR'),
    ('SAMUKTALA ROAD', 'AMTA'),
    ('SANGLI', 'SLI'),
    ('SANTRAGACHI', 'SRC'),
    ('SARNATH', 'SRNT'),
    ('SATARA', 'STR'),
    ('SATNA', 'STA'),
    ('SATTENAPALLE', 'SAP'),
    ('SAWAIMADHOPUR', 'SWM'),
    ('SAWANTWADI ROAD', 'SWV'),
    ('SEALDAH', 'SDAH'),
    ('SECUNDERABAD', 'SC'),
    ('SENGOTTAI', 'SCT'),
    ('SENSOA', 'SCF'),
    ('SEWAGRAM', 'SEGM'),
    ('SHAHABAD', 'SDB'),
    ('SHAHGANJ', 'SHG'),
    ('SHAHJAHANPUR', 'SPN'),
    ('SHAHPUR PATOREE', 'SPP'),
    ('SHAKTINAGAR', 'SKTN'),
    ('SHALIMAR', 'SHM'),
    ('SHAMGARH', 'SGZ'),
    ('SHAMLI', 'SMQL'),
    ('SHIKOHABAD', 'SKB'),
    ('SHIMLA', 'SML'),
    ('SHIMOGA TOWN', 'SMET'),
    ('SHIVPURI', 'SVPI'),
    ('SHORANUR JN.', 'SRR'),
    ('SHRI MAHABIRJI', 'SMBJ'),
    ('SIHOR GUJARAT', 'SOJN'),
    ('SIKAR', 'SIKR'),
    ('SILCHAR', 'SCL'),
    ('SILGHAT', 'SHTT'),
    ('SILIGURI', 'SGUJ'),
    ('SILIGURI TOWN', 'SGUT'),
    ('SIMALUGURI', 'SLGR'),
    ('SINGRAULI', 'SGRL'),
    ('SIRPUR KAGAZNAGAR', 'SKZR'),
    ('SIRSA', 'SSA'),
    ('SISWA BAZAR', 'SBZ'),
    ('SITAMARHI', 'SMI'),
    ('SITAPUR CITY', 'SPC'),
    ('SITAPUR CANTT.', 'SCC'),
    ('SIURI', 'SURI'),
    ('SIWAN', 'SV'),
    ('SOJAT ROAD', 'SOD'),
    ('SOLAN', 'SOL'),
    ('SOLAPUR', 'SUR'),
    ('SOMNATH', 'SMNH'),
    ('SOMPETA', 'SPT'),
    ('SONPUR', 'SEE'),
    ('SRI CHHATRAPATI SHAHU MAHARAJ (T)', 'CSMT'),
    ('SRI DUNGARGARH', 'SDGH'),
    ('SRIGANGA NAGAR', 'SGNR'),
    ('SRIKAKULAM ROAD', 'CHE'),
    ('SRI SATHYASAI PRASHANTI NILAYAM', 'SSPN'),
    ('SUJANGARH', 'SUJH'),
    ('SULTANPUR', 'SLN'),
    ('SURAT', 'ST'),
    ('SURATGARH', 'SOG'),
    ('SURATHKAL', 'SL'),
    ('SURENDRA NAGAR', 'SUNR'),
    ('TADEPALLIGUDEM', 'TDD'),
    ('TAMBARAM', 'TBM'),
    ('TATANAGAR', 'TATA'),
    ('THALASSERY', 'TLY'),
    ('TENALI', 'TEL'),
    ('TENKASI', 'TS'),
    ('TEZPUR', 'TZTB'),
    ('THANJAVUR', 'TJ'),
    ('THIRUVARUR', 'TVR'),
    ('TIRUCHCHIRAPPALLI JN.', 'TPJ'),
    ('TIRUCHENDUR', 'TCN'),
    ('TIRUNELVELI', 'TEN'),
    ('TIRUPATI', 'TPTY'),
    ('TIRUPPUR', 'TUP'),
    ('TIRUR', 'TIR'),
    ('TITLAGARH', 'TIG'),
    ('THRISUR', 'TCR'),
    ('THIRUVANANTHAPURAM', 'TVC'),
    ('TIRUVANNAMALAI', 'TNM'),
    ('TUMSAR ROAD', 'TMR'),
    ('TUNDLA', 'TDL'),
    ('TUNI', 'TUNI'),
    ('TUTICORIN', 'TN'),
    ('UDAIPUR CITY', 'UDZ'),
    ('UDHAMPUR', 'UHP'),
    ('UDHNA', 'UDN'),
    ('UDUPI', 'UD'),
    ('UJJAIN', 'UJN'),
    ('UNA', 'UNA'),
    ('UNCHAHAR', 'UCR'),
    ('UNNAO', 'ON'),
    ('VADAKARA', 'BDJ'),
    ('VADODARA', 'BRC'),
    ('VALSAD', 'BL'),
    ('VANCHI MANIYACHCHI JN.', 'MEJ'),
    ('VARANASI', 'BSB'),
    ('VARKALA', 'VAK'),
    ('VASAI ROAD', 'BSR'),
    ('VASCO-DA-GAMA', 'VSG'),
    ('VELANKANNI', 'VLKN'),
    ('VERAVAL', 'VRL'),
    ('VIDISHA', 'BHS'),
    ('VIJAYAWADA', 'BZA'),
    ('VILLUPURAM JN.', 'VM'),
    ('VIRAMGAM', 'VG'),
    ('VIRUDUNAGAR JN.', 'VPT'),
    ('VISAKHAPATNAM', 'VSKP'),
    ('VIZIANAGARAM', 'VZM'),
    ('VRIDDHACHALAM JN.', 'VRI'),
    ('WADI', 'WADI'),
    ('WANKANER', 'WKR'),
    ('WARANGAL', 'WL'),
    ('WARDHA JN.', 'WR'),
    ('YESVANTPUR', 'YPR'),
    ('ZAFARABAD', 'ZBD');
