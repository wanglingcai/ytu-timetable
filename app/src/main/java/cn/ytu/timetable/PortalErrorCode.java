package cn.ytu.timetable;

/** Stable error categories shared by all portal adapters. */
public enum PortalErrorCode {
    LOGIN_REQUIRED,
    RESULT_PAGE_NOT_FOUND,
    NETWORK_UNAVAILABLE,
    COURSE_NOT_FOUND,
    UNSUPPORTED_LAYOUT,
    API_SCHEMA_CHANGED,
    TIMEOUT,
    RESPONSE_TOO_LARGE
}
