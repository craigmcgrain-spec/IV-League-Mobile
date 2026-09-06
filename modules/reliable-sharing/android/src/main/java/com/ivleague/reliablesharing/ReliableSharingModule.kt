package com.ivleague.reliablesharing

import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.roundToInt

class ReliableSharingModule : Module() {
  private val preferenceName = "iv_league_shared_pdfs"
  private val preferenceKey = "exports"

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("IVLeagueReliableSharing")

    AsyncFunction("sharePdfAsync") { url: String, dialogTitle: String ->
      val file = requireReadablePdf(url)

      cleanupSharedPdfs(60 * 60 * 1000L)
      val contentUri = createShareUri(file)
      shareFile(contentUri, file.name, "application/pdf", dialogTitle)
    }

    AsyncFunction("sharePdfAsImageAsync") { url: String, dialogTitle: String ->
      val pdfFile = requireReadablePdf(url)
      val imageFile = renderPdfAsJpeg(pdfFile)
      val contentUri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.SharingFileProvider",
        imageFile
      )
      try {
        shareFile(
          contentUri,
          imageFile.name,
          "image/jpeg",
          dialogTitle,
          "The IV League II Completed Procedures"
        )
      } catch (error: Exception) {
        imageFile.delete()
        throw error
      }
      "file://${imageFile.absolutePath}"
    }

    AsyncFunction("cleanupSharedPdfsAsync") { maxAgeMs: Double ->
      cleanupSharedPdfs(maxAgeMs.toLong())
    }

    AsyncFunction("deleteSharedPdfsAsync") { filename: String ->
      deleteSharedPdfs(filename)
    }
  }

  private fun requireReadablePdf(url: String): File {
    val uri = Uri.parse(url)
    require(uri.scheme == "file") { "PDF attachments must use a local file URI." }
    val file = File(requireNotNull(uri.path) { "PDF attachment path is missing." })
    require(file.isFile && file.canRead() && file.length() > 0) {
      "PDF attachment is unavailable or empty."
    }
    return file
  }

  private fun shareFile(
    contentUri: Uri,
    filename: String,
    mimeType: String,
    dialogTitle: String,
    message: String? = null
  ) {
    val sharingIntent = Intent(Intent.ACTION_SEND).apply {
      type = mimeType
      putExtra(Intent.EXTRA_STREAM, contentUri)
      message?.let { putExtra(Intent.EXTRA_TEXT, it) }
      clipData = ClipData.newRawUri(filename, contentUri)
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

  private fun renderPdfAsJpeg(pdfFile: File): File {
    val descriptor = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
    PdfRenderer(descriptor).use { renderer ->
      require(renderer.pageCount > 0) { "The Completed Procedures PDF has no pages." }

      val pageSizes = (0 until renderer.pageCount).map { index ->
        renderer.openPage(index).use { page -> page.width to page.height }
      }
      val maxPageWidth = pageSizes.maxOf { it.first }
      val initialScale = 1080f / maxPageWidth
      val initialHeight = pageSizes.sumOf { (_, height) ->
        (height * initialScale).roundToInt()
      }
      val scale = if (initialHeight > 12000) {
        initialScale * (12000f / initialHeight)
      } else {
        initialScale
      }
      val outputWidth = (maxPageWidth * scale).roundToInt().coerceAtLeast(1)
      val outputHeight = pageSizes.sumOf { (_, height) ->
        (height * scale).roundToInt()
      }.coerceAtLeast(1)
      val combined = Bitmap.createBitmap(outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(combined).apply { drawColor(Color.WHITE) }

      try {
        var top = 0
        for (index in 0 until renderer.pageCount) {
          renderer.openPage(index).use { page ->
            val pageWidth = (page.width * scale).roundToInt().coerceAtLeast(1)
            val pageHeight = (page.height * scale).roundToInt().coerceAtLeast(1)
            val pageBitmap = Bitmap.createBitmap(pageWidth, pageHeight, Bitmap.Config.ARGB_8888)
            try {
              pageBitmap.eraseColor(Color.WHITE)
              page.render(
                pageBitmap,
                null,
                Matrix().apply { setScale(scale, scale) },
                PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY
              )
              canvas.drawBitmap(pageBitmap, ((outputWidth - pageWidth) / 2f), top.toFloat(), null)
              top += pageHeight
            } finally {
              pageBitmap.recycle()
            }
          }
        }

        val imageFile = File(
          requireNotNull(pdfFile.parentFile) { "Report cache directory is unavailable." },
          "${pdfFile.nameWithoutExtension}_text.jpg"
        )
        FileOutputStream(imageFile).use { output ->
          require(combined.compress(Bitmap.CompressFormat.JPEG, 88, output)) {
            "The text-message image could not be encoded."
          }
        }
        require(imageFile.isFile && imageFile.length() > 0) {
          "The text-message image could not be created."
        }
        return imageFile
      } finally {
        combined.recycle()
      }
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
