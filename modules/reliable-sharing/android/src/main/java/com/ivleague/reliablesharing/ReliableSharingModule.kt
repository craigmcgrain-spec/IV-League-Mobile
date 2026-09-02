package com.ivleague.reliablesharing

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ReliableSharingModule : Module() {
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

      val contentUri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.SharingFileProvider",
        file
      )
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
  }
}
