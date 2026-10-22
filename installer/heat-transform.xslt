<?xml version="1.0" encoding="utf-8"?>
<!--
  Two things the harvest cannot know on its own.

  1. The platform. The package is built for x64: the application
     belongs in the real Program Files and the registry values in the
     64-bit view of the registry. Windows Installer decides which view a
     component writes to from the component itself, so every component
     that the harvest produces has to say so.

  2. The executable. It is not harvested, because the package declares
     it itself: the Start menu and desktop shortcuts point at it, and a
     shortcut that Windows Installer advertises needs a component whose
     key path is the file the shortcut points at.
-->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes" />

  <!-- The component that the harvest put the executable in. -->
  <xsl:variable
    name="executableComponent"
    select="//*[local-name()='Component'][*[local-name()='File'][contains(@Source, 'muktodwar.exe')]]/@Id" />

  <xsl:template match="@*|node()">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()" />
    </xsl:copy>
  </xsl:template>

  <!-- Mark every harvested component as a 64-bit component. -->
  <xsl:template match="*[local-name()='Component']">
    <xsl:copy>
      <xsl:apply-templates select="@*" />
      <xsl:attribute name="Win64">yes</xsl:attribute>
      <xsl:apply-templates select="node()" />
    </xsl:copy>
  </xsl:template>

  <!--
    Leave the executable to the package, and take the reference to it
    with it. These two have to come last: a rule that matches with a
    condition wins over a rule that matches by name alone.
  -->
  <xsl:template match="*[local-name()='Component'][*[local-name()='File'][contains(@Source, 'muktodwar.exe')]]" />

  <!--
    The reference to the component that is leaving has to go with it.
    A pattern may not use a variable, so the group is copied by hand.
  -->
  <xsl:template match="*[local-name()='ComponentGroup']">
    <xsl:copy>
      <xsl:apply-templates select="@*" />
      <xsl:for-each select="node()">
        <xsl:if test="not(@Id = $executableComponent)">
          <xsl:apply-templates select="." />
        </xsl:if>
      </xsl:for-each>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
