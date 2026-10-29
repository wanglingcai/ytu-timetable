package cn.ytu.timetable;

/** A user-visible, stable failure returned by a school adapter. */
public final class AdapterException extends Exception {
    public final PortalErrorCode code;
    public final boolean retryable;

    public AdapterException(PortalErrorCode code, String message) {
        this(code, message, false);
    }

    public AdapterException(PortalErrorCode code, String message, boolean retryable) {
        super(message);
        this.code = code;
        this.retryable = retryable;
    }
}
