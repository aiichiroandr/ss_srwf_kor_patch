#include "mobile_profile.h"
void profile_disabled() {
    mobile_profile::Scope scope(0);
    mobile_profile::report(120, 2);
}
