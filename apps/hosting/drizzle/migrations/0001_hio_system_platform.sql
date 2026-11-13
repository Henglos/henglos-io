-- The platform was renamed @henglosio/platform -> @henglosio/hio-system, whose
-- first release is 1.1.0. The 1.0.x versions saved before only exist under the
-- old name, so those workflows move to 1.1.0 (same runtime, the sdk split out).
UPDATE `workflows` SET `platform` = '1.1.0' WHERE `platform` LIKE '1.0.%';
