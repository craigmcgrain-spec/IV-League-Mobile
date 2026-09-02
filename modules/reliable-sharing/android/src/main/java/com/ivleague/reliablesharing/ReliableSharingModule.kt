package com.ivleague.reliablesharing

import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ReliableSharingModule : Module() {
  private val preferenceName = "iv_league_shared_pdfs"
  private val preferenceKey = "exports"

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("IVLeagueReliableSharing")

    AsyncFunction("sharePdfAsync") { url: String, dialogTitle: String ->
      val uri = Uri.parse(url)
      require(uri.scheme == "file") { "PDF attachments must use a local file URI." }

      val file = File(requireNotNull(uri.path) { "PDF attachment path is missing." })
      require(file.isFile && file.canRead() && file.length() > 0) {
        "PDF attachment is unavailable or empty."
      }

      cleanupSharedPdfs(60 * 60 * 1000L)
      val contentUri = createShareUri(file)
      val sharingIntent = Intent(Intent.ACTION_SEND).apply {
        type = "application/pdf"
        putExtra(Intent.EXTRA_STREAM, contentUri)
        clipData = ClipData.newRawUri(file.name, contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      context.packageManager
        .queryIntentActivities(sharingIntent, PackageManager.MATCH_DEFAULT_ONLY)
        .forEach { target ->
          context.grantUriPermission(
            target.activityInfo.packageName,
            contentUri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION
          )
        }

      appContext.throwingActivity.startActivity(
        Intent.createChooser(sharingIntent, dialogTitle)
      )
    }

    AsyncFunction("cleanupSharedPdfsAsync") { maxAgeMs: Double ->
      cleanupSharedPdfs(maxAgeMs.toLong())
    }

    AsyncFunction("deleteSharedPdfsAsync") { filename: String ->
      deleteSharedPdfs(filename)
    }
  }

  private fun createShareUri(file: File): Uri {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return FileProvider.getUriForFile(
        context,
        "${context.packageName}.SharingFileProvider",
        file
      )
    }

    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, file.name)
      put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
      put(
        MediaStore.Downloads.RELATIVE_PATH,
        "${Environment.DIRECTORY_DOWNLOADS}/IV League"
      )
      put(MediaStore.Downloads.IS_PENDING, 1)
    }
    val contentUri = requireNotNull(
      context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
    ) { "Android could not prepare the PDF attachment." }

    try {
      context.contentResolver.openOutputStream(contentUri, "w").use { output ->
        requireNotNull(output) { "Android could not open the PDF attachment." }
        file.inputStream().use { input -> input.copyTo(output) }
      }
      val completedValues = ContentValues().apply {
        put(MediaStore.Downloads.IS_PENDING, 0)
      }
      context.contentResolver.update(contentUri, completedValues, null, null)
      rememberSharedPdf(file.name, contentUri)
      return contentUri
    } catch (error: Exception) {
      context.contentResolver.delete(contentUri, null, null)
      throw error
    }
  }

  private fun rememberSharedPdf(filename: String, uri: Uri) {
    val preferences = context.getSharedPreferences(preferenceName, 0)
    val exports = preferences.getStringSet(preferenceKey, emptySet()).orEmpty().toMutableSet()
    exports.add("${System.currentTimeMillis()}\t$filename\t$uri")
    preferences.edit().putStringSet(preferenceKey, exports).apply()
  }

  private fun cleanupSharedPdfs(maxAgeMs: Long) {
    val cutoff = System.currentTimeMillis() - maxAgeMs
    updateSharedPdfs { createdAt, _, uri -> createdAt <= cutoff && deleteUri(uri) }
  }

  private fun deleteSharedPdfs(filename: String) {
    updateSharedPdfs { _, storedFilename, uri ->
      storedFilename == filename && deleteUri(uri)
    }
  }

  private fun updateSharedPdfs(shouldRemove: (Long, String, Uri) -> Boolean) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return
    }

    val preferences = context.getSharedPreferences(preferenceName, 0)
    val exports = preferences.getStringSet(preferenceKey, emptySet()).orEmpty()
    val retained = exports.filterNot { entry ->
      val parts = entry.split('\t', limit = 3)
      val createdAt = parts.getOrNull(0)?.toLongOrNull() ?: return@filterNot true
      val filename = parts.getOrNull(1) ?: return@filterNot true
      val uri = parts.getOrNull(2)?.let(Uri::parse) ?: return@filterNot true
      shouldRemove(createdAt, filename, uri)
    }.toSet()
    preferences.edit().putStringSet(preferenceKey, retained).apply()
  }

  private fun deleteUri(uri: Uri): Boolean {
    return try {
      context.contentResolver.delete(uri, null, null)
      true
    } catch (_: SecurityException) {
      true
    }
  }
}
