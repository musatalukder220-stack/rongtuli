package com.rongtuli.photoeditor;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.List;

/**
 * Lets another app read ONE file that the user chose to share:
 *   content://com.rongtuli.photoeditor.share/<number>/<file name>  ->  <cache>/share/<number>/<file name>
 * Nothing else can be reached, and only an app that was handed the address may read it.
 */
public class ShareProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }

    private File fileFor(Uri uri) throws FileNotFoundException {
        List<String> seg = uri.getPathSegments();
        if (seg == null || seg.size() != 2) throw new FileNotFoundException("unknown address");
        File base = new File(getContext().getCacheDir(), "share");
        File f = new File(new File(base, seg.get(0)), seg.get(1));
        try {
            if (!f.getCanonicalPath().startsWith(base.getCanonicalPath() + File.separator)) throw new FileNotFoundException("outside the shared folder");
        } catch (IOException e) { throw new FileNotFoundException("bad path"); }
        if (!f.isFile()) throw new FileNotFoundException("the file is gone");
        return f;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name != null) {
            int dot = name.lastIndexOf('.');
            if (dot >= 0) {
                String t = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(java.util.Locale.US));
                if (t != null) return t;
            }
        }
        return "application/octet-stream";
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        String[] cols = projection != null ? projection : new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        MatrixCursor c = new MatrixCursor(cols, 1);
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return c; }
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
            else row[i] = null;
        }
        c.addRow(row);
        return c;
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("read only"); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException("read only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException("read only"); }
}
